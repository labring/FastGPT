// src/skills/expertise/answer.ts
// Answer Skill - 完整版：生成 + 反思 + Citation 验证

import type { SkillInput, SkillOutput } from '../base';
import { BaseSkill } from '../base';
import type { ChunkItem } from '../../types/chunk';
import type { LLMMessage } from '../../types/message';
import { convertCitations, CitationStreamBuffer } from '../../utils/citation';
import { detectLang } from '../../utils/lang';

/**
 * Answer 选项
 */
export interface AnswerOptions {
  query: string;
  chunks: ChunkItem[];
  history?: LLMMessage[];
  enableReflection?: boolean;
  mode?: 'search' | 'chat';
  playbook_hint?: string;
  analysis?: string;
}

/**
 * Answer 结果
 */
export interface AnswerResult {
  answer: string;
  citedIds: (number | string)[];
  confidence: number;
  reflectionLabel?: string;
  reflectionReason?: string;
  refuse?: boolean;
  llm_calls?: number;
  status?: string;
}

// ============================================================
// 完整版 System Prompt（参考 Python 114 行）
// ============================================================
const GENERATE_SYSTEM_PROMPT = `You are an enterprise knowledge base QA assistant. Generate an answer to the user's question based STRICTLY on the provided knowledge chunks.

**LANGUAGE REQUIREMENT (HIGHEST PRIORITY)**: You MUST respond in {question_lang}. This overrides everything else. Even if all knowledge chunks are in a different language, you MUST translate and compose your entire answer in {question_lang}. Never let the source language of the chunks influence the language of your response.

{analysis_section}

## Knowledge Chunks
{chunks_text}

## Answer Quality Standards

1. **Summary-Detail Structure**: State the core conclusion first, then elaborate in numbered points. Never write large blocks of unstructured text.
   - Within each level, put the most critical information first.
   - If the user is looking for a document or resource, place the document name and link at the very top of the answer.

2. **Grounded in Sources**: Every key statement must be supported by a knowledge chunk. Cite using [id-1], [id-2], [id-3], etc. inline (the number after "id-" refers to the chunk number), immediately after the relevant sentence or point. NEVER pile citations at the end. Each citation must reference exactly one source — do not merge citations like [id-1, id-2]; instead write [id-1] [id-2].

**MUST INCLUDE AT LEAST ONE CITATION**: Your answer MUST contain at least one [id-1], [id-2], etc. citation. If you fail to include any citation, the answer will be rejected and regenerated.

3. **Bold Key Information**: Use **bold** for critical data, configuration values, product names, version numbers, and important conclusions.

4. **Markdown Formatting**:
   - First-level points: ordered list (1. 2. 3.)
   - Second-level points: unordered list (- )

5. **Auxiliary Information**: After answering the core question, proactively add related useful information (prerequisites, caveats, related configurations) if available in the knowledge chunks. Judge independently whether auxiliary information is necessary — include it when it genuinely helps the user, not for every answer.

6. **Insufficient Information**: If the knowledge chunks do not contain enough information to answer fully, explicitly state which aspects are missing. Provide actionable suggestions (e.g., "contact technical support" or "check version X documentation"). Never give a vague refusal.

7. **Inductive Synthesis**: When multiple chunks cover the same topic, synthesize them into a coherent answer. Do not copy-paste. If sources conflict or have different timestamps, present them as parallel points at the same level, noting the discrepancy.

8. **No Fabrication**: If no relevant chunk exists, state clearly that the knowledge base does not contain this information. Do not guess or use outside knowledge.

9. **Information Filtering**: When multiple sources exist, prefer recent and authoritative documents. Filter by update time, creation time, and relevance. For time-ordered topics, present information in reverse chronological order (most recent first).

10. **No Reference Meta-Discussion**: Do not mention "reference materials", "knowledge chunks", or "sources" explicitly in the answer. Let citations ([id-1], [id-2], etc.) speak for themselves.

11. **Concise**: Avoid repetitive expressions. Each point should add new information. In the summary-detail structure, do not repeat the summary content in the detail points.

`;

// ============================================================
// Reflection Prompt
// ============================================================
const REFLECT_PROMPT = `Evaluate the quality of the following answer.

**User question:** {question}

**Knowledge chunks:**
{chunks_text}

**Generated answer:**
{answer}

## Evaluation Dimensions

1. **Faithfulness**: Does the answer only contain information from the knowledge chunks? Flag any statement not supported by the chunks (hallucination).
2. **Completeness**: Does the answer address ALL aspects of the question? Are there important points in the chunks that were missed?
3. **Answer type match**: Does the answer format match the user's intent? (e.g., if they asked to find a document, does the answer provide document names/links? If they asked for steps, are numbered steps provided?)
4. **Citation accuracy**: Are [id-1], [id-2], etc. citations correctly placed inline? Do cited numbers match the actual source chunks? Are citations merged improperly (e.g., [id-1, id-2] instead of [id-1] [id-2])? Are citations piled at the end instead of placed inline?
5. **Relevance**: Is the answer directly addressing the user's question? Is there irrelevant or off-topic content?

## Output

Return a JSON object:
{"label": "<label>", "reason": "<brief explanation>"}

Labels:
- "correct": Answer is faithful, complete, well-cited, and relevant.
- "unfaithful": Answer contains information not in the knowledge chunks.
- "incomplete": Answer is correct but misses important information from the chunks.
- "irrelevant": Answer does not address the user's question.
`;

// ============================================================
// Citation Fix Prompt
// ============================================================
const CITATION_FIX_PROMPT = `Your previous answer cited non-existent knowledge chunk references: {invalid_ids}.

The only valid chunk references are: {valid_ids}

Please regenerate the answer, citing only the valid references using [id-1], [id-2], [id-3], etc. Do not cite any reference number not in the list.
`;

// ============================================================
// 格式化 chunks
// ============================================================
function formatChunks(chunks: ChunkItem[]): string {
  const lines: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    lines.push(
      `[id-${i + 1}] (source: ${chunk.sourceName || 'unknown'}, relevance: ${chunk.score?.toFixed(2) || 'N/A'})`
    );
    lines.push(chunk.content || '');
    lines.push('');
  }
  return lines.join('\n');
}

// ============================================================
// 提取引用的 ID
// ============================================================
function extractCitedIds(text: string, validIndices?: Set<number>): (number | string)[] {
  // 1. 短索引格式: [id-1], [id-2], [id-3]...
  const indexMatches = text.match(/\[id-(\d+)\]/g);
  if (indexMatches) {
    const indices = [
      ...new Set(indexMatches.map((m) => parseInt(m.match(/\[id-(\d+)\]/)?.[1] || '0')))
    ].sort((a, b) => a - b);
    if (validIndices) {
      return indices.filter((i) => validIndices.has(i));
    }
    return indices;
  }

  // 2. 完整 ID 格式: [id-xxx] (legacy)
  const idMatches = text.match(/\[id-([a-zA-Z0-9_-]+)\]/g);
  if (idMatches) {
    return [...new Set(idMatches.map((m) => m.match(/\[id-([a-zA-Z0-9_-]+)\]/)?.[1] || ''))].sort();
  }

  // 3. FastGPT CITE 格式: [xxx](CITE)
  const citeMatches = text.match(/\[([^\]]+)\]\(CITE\)/g);
  if (citeMatches) {
    const ids = citeMatches
      .map((m) => {
        const match = m.match(/\[([^\]]+)\]\(CITE\)/);
        return match?.[1] || '';
      })
      .filter(Boolean);

    // 尝试解析为数字索引
    const numericIds: number[] = [];
    const stringIds: string[] = [];
    for (const id of [...new Set(ids)]) {
      const num = parseInt(id, 10);
      if (!isNaN(num)) {
        numericIds.push(num);
      } else {
        stringIds.push(id);
      }
    }

    let result: (number | string)[];
    if (numericIds.length > 0) {
      // 先过滤 validIndices，再转 number[]
      let filteredNums = numericIds.sort((a, b) => a - b);
      if (validIndices) {
        filteredNums = filteredNums.filter((i) => validIndices.has(i));
      }
      result = filteredNums;
    } else {
      result = stringIds.sort();
    }
    return result;
  }

  return [];
}

/**
 * Answer Skill - 完整版
 * 1. 生成答案（完整 system prompt）
 * 2. 反思循环（多轮）
 * 3. Citation 验证和修复
 */
export class AnswerSkill extends BaseSkill {
  name = 'answer';
  description = 'Generate answer with reflection and citation validation (full version)';

  private maxReflectRounds = 3;
  private maxCitationRetries = 2;

  async execute(input: SkillInput): Promise<SkillOutput> {
    const {
      query,
      chunks,
      history: _history = [],
      enableReflection: _enableReflection = true,
      mode = 'chat',
      playbook_hint = '',
      analysis = ''
    } = input as unknown as AnswerOptions;

    if (!this.llm) {
      return this.fail('LLMProvider not initialized');
    }

    if (mode === 'search') {
      return this.success({
        answer: '',
        citedIds: chunks.map((c) => c.id),
        confidence: 1.0
      });
    }

    if (!playbook_hint && chunks.length === 0) {
      return this.success({
        answer:
          'No relevant information found in the knowledge base for your question. Please try rephrasing with different keywords.',
        citedIds: [],
        confidence: 0.0,
        reflectionLabel: 'irrelevant',
        reflectionReason: 'No knowledge chunks available',
        refuse: true,
        llm_calls: 0,
        status: 'NO_KNOWLEDGE'
      });
    }

    try {
      // 检测语言
      const questionLang = detectLang(query);

      // 构建 chunk ID 映射
      const chunkIdMap = new Map<number, string>();
      chunks.forEach((chunk, i) => chunkIdMap.set(i + 1, chunk.id));

      const chunksText = formatChunks(chunks);
      const analysisSection = analysis ? `## Analysis Context\n\n${analysis}` : '';
      const validIndices = new Set(chunkIdMap.keys());

      let llmCalls = 0;

      // Step 1: 生成答案
      let systemPrompt = GENERATE_SYSTEM_PROMPT.replace('{question_lang}', questionLang)
        .replace('{analysis_section}', analysisSection)
        .replace('{chunks_text}', chunksText);

      const answerResult = await this.generateAnswer(systemPrompt, query);
      llmCalls++;

      let answerText = answerResult.answer;

      // Step 2: Reflection 循环
      let reflectionLabel = 'correct';
      let reflectionReason = '';

      for (let round = 0; round < this.maxReflectRounds; round++) {
        // 反思
        const reflectInput = REFLECT_PROMPT.replace('{question}', query)
          .replace('{chunks_text}', chunksText)
          .replace('{answer}', answerText);

        const reflectResult = await this.llm.chat([{ role: 'user', content: reflectInput }], {
          temperature: 0.3,
          maxTokens: 512
        });
        llmCalls++;

        // 解析反思结果
        try {
          const parsed = JSON.parse(reflectResult.content);
          const label = (parsed.label || '').toLowerCase().trim();
          if (['correct', 'unfaithful', 'incomplete', 'irrelevant'].includes(label)) {
            reflectionLabel = label;
            reflectionReason = parsed.reason || '';
          } else {
            reflectionLabel = 'correct';
            reflectionReason = parsed.reason || reflectResult.content;
          }
        } catch {
          const content = reflectResult.content.toLowerCase().trim();
          if (['correct', 'unfaithful', 'incomplete', 'irrelevant'].includes(content)) {
            reflectionLabel = content;
          } else {
            reflectionLabel = 'correct';
          }
        }

        if (reflectionLabel === 'correct') {
          break;
        }

        // 反思失败，改进答案
        const systemPromptV2 =
          systemPrompt +
          `\n\nPrevious answer reflection: ${reflectionLabel} (${reflectionReason}). Please improve the answer.`;

        const improvedResult = await this.generateAnswer(systemPromptV2, query);
        llmCalls++;
        answerText = improvedResult.answer;
      }

      // Step 3: Citation 验证循环
      let status = 'SUCCESS';
      let citedIds = extractCitedIds(answerText, validIndices);
      let invalidIndices = citedIds.filter(
        (id) => typeof id === 'number' && !validIndices.has(id as number)
      );

      for (let i = 0; i < this.maxCitationRetries; i++) {
        if (invalidIndices.length === 0) break;

        const fixPrompt = CITATION_FIX_PROMPT.replace(
          '{invalid_ids}',
          invalidIndices.map((id) => String(id)).join(', ')
        ).replace('{valid_ids}', [...validIndices].sort((a, b) => a - b).join(', '));

        const systemPromptFix = systemPrompt + `\n\n${fixPrompt}`;
        const fixedResult = await this.generateAnswer(systemPromptFix, query);
        llmCalls++;
        answerText = fixedResult.answer;

        citedIds = extractCitedIds(answerText, validIndices);
        invalidIndices = citedIds.filter(
          (id) => typeof id === 'number' && !validIndices.has(id as number)
        );
      }

      if (invalidIndices.length > 0) {
        status = 'SUCCESS_WITH_INVALID_IDS';
      }

      // 转换引用格式: [id-xxx] -> [xxx](CITE)
      const answerTextConverted = convertCitations(answerText, chunkIdMap);
      const confidence = reflectionLabel === 'correct' ? 0.9 : 0.5;

      return this.success({
        answer: answerTextConverted,
        citedIds,
        confidence,
        reflectionLabel,
        reflectionReason,
        refuse: false,
        llm_calls: llmCalls,
        status
      });
    } catch (error) {
      return this.fail(`Answer generation failed: ${error}`);
    }
  }

  /**
   * 流式执行 - 包装 answerStream 为 SkillOutput 流
   * 用于 TTFT 统计和真正的流式输出
   */
  async *executeStream(input: SkillInput): AsyncGenerator<SkillOutput> {
    const {
      query,
      chunks,
      playbook_hint = '',
      analysis = '',
      startTime: inputStartTime
    } = input as unknown as AnswerOptions & { startTime?: number };

    let fullAnswer = '';
    let firstTokenTime: number | null = null;
    let citedIds: string[] = [];
    let confidence = 0.9;
    let reflectionLabel = 'correct';
    let reflectionReason = '';
    let refuse = false;

    // 遍历 answerStream 事件
    for await (const event of this.answerStream(query, chunks, playbook_hint, analysis)) {
      // 记录第一个 token 的时间（用于 TTFT）
      if (event.type === 'token' && !firstTokenTime) {
        firstTokenTime = Date.now();
      }

      if (event.type === 'token') {
        fullAnswer += event.token as string;
      }

      if (event.type === 'done') {
        const result = event.result as AnswerResult;
        citedIds = (result.citedIds || []).map(String);
        confidence = result.confidence ?? 0.9;
        reflectionLabel = result.reflectionLabel ?? 'correct';
        reflectionReason = result.reflectionReason ?? '';
        refuse = result.refuse ?? false;

        // 计算 TTFT
        let ttftMs: number | undefined;
        if (firstTokenTime && inputStartTime) {
          ttftMs = firstTokenTime - inputStartTime;
        }

        // Yield 最终结果
        yield this.success({
          answer: result.answer || fullAnswer,
          citedIds,
          confidence,
          reflectionLabel,
          reflectionReason,
          refuse,
          ttftMs
        });
      }
    }
  }

  private async generateAnswer(
    systemPrompt: string,
    question: string
  ): Promise<{ answer: string }> {
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question }
    ];

    const result = await this.llm!.chat(messages, { temperature: 0.7, maxTokens: 4096 });
    return { answer: result.content };
  }

  /**
   * 流式答案生成（对齐 Python answer_stream()）
   *
   * Event types:
   * - { type: 'token', token: string } — each token during generation
   * - { type: 'reflect_start' } — reflection started
   * - { type: 'reflect_done', label: string, reason: string } — reflection result
   * - { type: 'regenerate', reason: string } — reflection failed, regenerating
   * - { type: 'citation_fix', invalidIds: number[] } — citation fix in progress
   * - { type: 'citation_regenerated', answer: string } — new answer after citation fix
   * - { type: 'done', result: AnswerResult } — final result
   */
  async *answerStream(
    question: string,
    chunks: ChunkItem[],
    playbookHint: string = '',
    analysis: string = ''
  ): AsyncGenerator<Record<string, unknown>> {
    if (!this.llm) {
      yield {
        type: 'done',
        result: {
          answer: 'LLM provider not initialized.',
          citedIds: [],
          confidence: 0,
          refuse: true
        }
      };
      return;
    }

    if (!playbookHint && chunks.length === 0) {
      yield {
        type: 'done',
        result: {
          answer:
            'No relevant information found in the knowledge base for your question. Please try rephrasing with different keywords.',
          citedIds: [],
          confidence: 0.0,
          reflectionLabel: 'irrelevant',
          reflectionReason: 'No knowledge chunks available',
          refuse: true,
          llm_calls: 0,
          status: 'NO_KNOWLEDGE'
        }
      };
      return;
    }

    const questionLang = detectLang(question);
    const chunkIdMap = new Map<number, string>();
    chunks.forEach((chunk, i) => chunkIdMap.set(i + 1, chunk.id));
    const chunksText = formatChunks(chunks);
    const analysisSection = analysis
      ? `## Analysis Context\n\n${analysis}`
      : '## Analysis Context\n\n(无)';
    const validIndices = new Set(chunkIdMap.keys());
    let llmCalls = 0;

    let systemPrompt = GENERATE_SYSTEM_PROMPT.replace('{question_lang}', questionLang)
      .replace('{analysis_section}', analysisSection)
      .replace('{chunks_text}', chunksText || playbookHint);

    // Step 1: 流式生成完整答案
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question }
    ];

    // 创建引用转换 buffer
    const citationBuffer = new CitationStreamBuffer(chunkIdMap);

    let answerParts: string[] = [];
    for await (const chunk of this.llm.chatStream(messages, {
      temperature: 0.7,
      maxTokens: 4096
    })) {
      if (chunk.content) {
        // 通过 buffer 处理 token，处理可能被分割的引用标记
        const converted = citationBuffer.feed(chunk.content);
        answerParts.push(converted);
        yield { type: 'token', token: converted };
      }
    }
    // 刷新剩余缓冲
    const remaining = citationBuffer.flushRemaining();
    if (remaining) {
      answerParts.push(remaining);
      yield { type: 'token', token: remaining };
    }
    let answerText = answerParts.join('');
    llmCalls++;

    // Step 2: 反思循环
    let reflectionLabel = 'correct';
    let reflectionReason = '';

    for (let round = 0; round < this.maxReflectRounds; round++) {
      yield { type: 'reflect_start' };

      const reflectInput = REFLECT_PROMPT.replace('{question}', question)
        .replace('{chunks_text}', chunksText)
        .replace('{answer}', answerText);

      let reflectParts: string[] = [];
      for await (const ch of this.llm.chatStream([{ role: 'user', content: reflectInput }], {
        temperature: 0.3,
        maxTokens: 512
      })) {
        if (ch.content) reflectParts.push(ch.content);
      }
      const reflectResp = reflectParts.join('');
      llmCalls++;

      try {
        const parsed = JSON.parse(reflectResp);
        const label = (parsed.label || '').toLowerCase().trim();
        if (['correct', 'unfaithful', 'incomplete', 'irrelevant'].includes(label)) {
          reflectionLabel = label;
          reflectionReason = parsed.reason || '';
        } else {
          reflectionLabel = 'correct';
          reflectionReason = parsed.reason || reflectResp.trim();
        }
      } catch {
        const content = reflectResp.toLowerCase().trim();
        if (['correct', 'unfaithful', 'incomplete', 'irrelevant'].includes(content)) {
          reflectionLabel = content;
        } else {
          reflectionLabel = 'correct';
        }
      }

      yield { type: 'reflect_done', label: reflectionLabel, reason: reflectionReason };

      if (reflectionLabel === 'correct') break;

      // 反思失败 → 流式重新生成
      yield { type: 'regenerate', reason: `${reflectionLabel}: ${reflectionReason}` };

      const systemPromptV2 =
        systemPrompt +
        `\n\nPrevious answer reflection: ${reflectionLabel} (${reflectionReason}). Please improve the answer.`;

      answerParts = [];
      // 重新生成时也需要用 buffer 处理引用标记
      const regenerateBuffer = new CitationStreamBuffer(chunkIdMap);
      for await (const ch of this.llm.chatStream(
        [
          { role: 'system', content: systemPromptV2 },
          { role: 'user', content: question }
        ],
        { temperature: 0.7, maxTokens: 4096 }
      )) {
        if (ch.content) {
          const converted = regenerateBuffer.feed(ch.content);
          answerParts.push(converted);
          yield { type: 'token', token: converted };
        }
      }
      // 刷新剩余缓冲
      const regenRemaining = regenerateBuffer.flushRemaining();
      if (regenRemaining) {
        answerParts.push(regenRemaining);
        yield { type: 'token', token: regenRemaining };
      }
      answerText = answerParts.join('');
      llmCalls++;
    }

    // Step 3: Citation 验证和修复（同步修复，不流式）
    let status = 'SUCCESS';
    let citedIds = extractCitedIds(answerText, validIndices);
    let invalidIndices = citedIds.filter(
      (id) => typeof id === 'number' && !validIndices.has(id as number)
    ) as number[];

    for (let i = 0; i < this.maxCitationRetries; i++) {
      if (invalidIndices.length === 0) break;

      yield { type: 'citation_fix', invalidIds: invalidIndices };

      const fixPrompt = CITATION_FIX_PROMPT.replace(
        '{invalid_ids}',
        invalidIndices.map(String).join(', ')
      ).replace('{valid_ids}', [...validIndices].sort((a, b) => a - b).join(', '));

      const systemPromptFix = systemPrompt + `\n\n${fixPrompt}`;
      const fixResult = await this.llm.chat(
        [
          { role: 'system', content: systemPromptFix },
          { role: 'user', content: question }
        ],
        { temperature: 0.7, maxTokens: 4096 }
      );
      answerText = fixResult.content;
      llmCalls++;

      citedIds = extractCitedIds(answerText, validIndices);
      invalidIndices = citedIds.filter(
        (id) => typeof id === 'number' && !validIndices.has(id as number)
      ) as number[];
      yield { type: 'citation_regenerated', answer: answerText };
    }

    if (invalidIndices.length > 0) status = 'SUCCESS_WITH_INVALID_IDS';

    yield {
      type: 'done',
      result: {
        answer: answerText,
        citedIds,
        confidence: reflectionLabel === 'correct' ? 0.9 : 0.5,
        reflectionLabel,
        reflectionReason,
        refuse: false,
        llm_calls: llmCalls,
        status
      } as AnswerResult
    };
  }
}

// ============================================================
// formatAnswerSummary（对齐 Python format_answer_summary）
// ============================================================

/**
 * 将 AnswerSkill 结果格式化为 Agent tool observation（含反思状态和完整答案）
 */
export function formatAnswerSummary(result: AnswerResult): string {
  const reflectionInfo = result.reflectionLabel
    ? result.reflectionReason
      ? `${result.reflectionLabel} (${result.reflectionReason})`
      : result.reflectionLabel
    : 'unknown';

  const citationsStr =
    result.citedIds && result.citedIds.length > 0 ? result.citedIds.map(String).join(', ') : 'none';

  return [
    `Answer generated. Reflection: ${reflectionInfo}, confidence: ${result.confidence.toFixed(2)}`,
    `Citations: ${citationsStr}`,
    '',
    result.answer
  ].join('\n');
}
