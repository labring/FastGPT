// src/agent/nodes.ts
// 节点函数 - 所有 LangGraph 节点工厂函数
// 职责：接受 (providers, skills, config) 返回节点函数，不包含图结构连线逻辑
// 混合机制：直接修改 ctx，通过 toStateUpdate() 同步到 LangGraph state

import { END } from '@langchain/langgraph';
import type { AgenticSearchConfig, AgenticSearchProviders } from '../ports/agentic';
import type { ChunkItem } from '../types/chunk';
import type { LLMMessage, ToolCall } from '../types/message';
import type { AgenticRAGStateType, AgenticRAGUpdateType } from '../types/state';
import type { SkillBundle } from './graph';
import type { RequestContext } from './context';
import { TOOL_DEFINITIONS, parseAllToolCalls, getSystemPrompt } from './tools';
import { routePlaybook } from './playbooks/router';
import { extractChatHistoryInfo } from '../utils/compression';
import { detectLang } from '../utils/lang';
import {
  parseSearchQueries,
  isSimilarQuery,
  formatReferences,
  getDimensionSynonyms
} from '../utils/text';
import { TOOLS, IRRELEVANT_BGE_THRESHOLD, IRRELEVANT_LLM_THRESHOLD } from '../utils/constants';
import { formatRewriteSummary } from '../skills/expertise/query_rewrite/index';
import type { QueryRewriteResult } from '../skills/expertise/query_rewrite/index';
import { formatAnswerSummary } from '../skills/expertise/answer';
import type { AnswerSkill } from '../skills/expertise/answer';
import { subQueryFilter, STAGE1_ENABLED_PLAYBOOKS } from '../skills/atomic/chunk_selector';
import { InformationGainCalculator } from '../utils/info_gain';
import type { PlanStep } from '../types/state';

/** 获取 logger 的辅助函数 */
const getNodeLogger = (providers: AgenticSearchProviders) => providers.logger;

// ============================================================
// Blackboard Brief（对齐 Python _build_progress_guidance）
// ============================================================

const SIMPLE_QUERY_HIGH_SCORE = 0.7;
const SIMPLE_QUERY_OVERLAP_THRESHOLD = 0.7;

/**
 * 判断本次搜索结果是否全部不相关
 *
 * 信号优先级：
 * 1. 优先用 llm_sub_query_score（语义评分，规避短问句/长chunk BGE稀释问题）
 * 2. LLM score 不可用时（STAGE1 未启用的 playbook）回退到 BGE score
 *
 * @param chunks - 搜索返回的 chunks（Stage1 过滤后）
 */
export function isSearchIrrelevant(chunks: ChunkItem[]): boolean {
  if (chunks.length === 0) return true;

  // 优先信任 LLM sub_query_score
  const llmScores = chunks
    .map((c) => c.llm_sub_query_score)
    .filter((s): s is number => s !== undefined);

  if (llmScores.length > 0) {
    const bestLLM = Math.max(...llmScores);
    return bestLLM < IRRELEVANT_LLM_THRESHOLD;
  }

  // 无 LLM score 时回退 BGE
  const bestBGE = Math.max(...chunks.map((c) => c.rerankScore ?? c.score ?? 0));
  return bestBGE < IRRELEVANT_BGE_THRESHOLD;
}

/**
 * 构建进度引导消息，注入给 Agent 指示"继续搜索"还是"调用 @answer"
 */
function buildProgressGuidance(
  state: AgenticRAGStateType,
  maxSearchCalls: number,
  toolNames: string[]
): string {
  const lines: string[] = ['[Blackboard Brief]'];

  // 1. Goal: 初始分析
  if (state.analysis) {
    lines.push(`Goal: ${state.analysis}`);
  }

  // 2. Plan: 改写计划覆盖状态
  if (state.rewriteQueries && state.rewriteQueries.length > 0) {
    const searchedSet = new Set(state.searchQueries);
    lines.push('Plan (✓ searched, ○ pending):');
    for (const q of state.rewriteQueries) {
      const mark = searchedSet.has(q) ? '✓' : '○';
      lines.push(`  ${mark} ${q}`);
    }
  }

  // 3. Executed: 搜索进度 + 来源统计
  lines.push(`Searches: ${state.searchCount}/${maxSearchCalls}, chunks: ${state.allChunks.length}`);

  // 额外查询（不在改写计划内的）
  if (state.searchQueries.length > 0) {
    const rewriteSet = new Set(state.rewriteQueries);
    const extra = state.searchQueries.filter((q) => !rewriteSet.has(q));
    if (extra.length > 0) {
      lines.push(`Ad-hoc queries: ${extra.map((q) => `"${q}"`).join(', ')}`);
    }
  }

  // 来源分布
  if (state.allChunks.length > 0) {
    const sources: Record<string, number> = {};
    for (const c of state.allChunks) {
      const name = c.sourceName || 'unknown';
      sources[name] = (sources[name] || 0) + 1;
    }
    const sourceList = Object.entries(sources)
      .map(([name, cnt]) => `${name}(${cnt})`)
      .join(', ');
    lines.push(`Sources: ${sourceList}`);
  }

  // Findings / Lacks
  if (state.findings && state.findings.length > 0) {
    lines.push('Findings:');
    for (const f of state.findings) lines.push(`  • ${f}`);
  }
  if (state.lacks && state.lacks.length > 0) {
    lines.push('Lacks:');
    for (const la of state.lacks) lines.push(`  • ${la}`);
  } else if (state.findings && state.findings.length > 0) {
    lines.push('No remaining gaps.');
  }

  // 4. Gap check：引导 Agent 决策
  lines.push('');

  // simple_query 高分命中时：强制指令立即回答
  if (state.playbook === 'simple_query' && state.allChunks.length > 0) {
    const bestScore = Math.max(...state.allChunks.map((c) => c.rerankScore ?? c.score ?? 0));
    if (bestScore >= SIMPLE_QUERY_HIGH_SCORE) {
      lines.push(
        `⚡ STOP SEARCHING. High-relevance results found (best score: ${bestScore.toFixed(3)} ≥ ${SIMPLE_QUERY_HIGH_SCORE}).`
      );
      lines.push('→ You MUST call @answer NOW. Do NOT search again.');
      return lines.join('\n');
    }
    if (state.lastSearchOverlap >= SIMPLE_QUERY_OVERLAP_THRESHOLD) {
      lines.push(
        `⚡ STOP SEARCHING. Search space saturated (${(state.lastSearchOverlap * 100).toFixed(0)}% overlap on last search).`
      );
      lines.push('→ You MUST call @answer NOW with what you have.');
      return lines.join('\n');
    }
  }

  // comparative_analysis：显示维度覆盖进度（对齐 Python _build_progress_guidance 第 268-295 行）
  if (
    state.playbook === 'comparative_analysis' &&
    state.discoveredDimensions &&
    state.discoveredDimensions.length > 0
  ) {
    lines.push('Dimension Coverage:');
    for (const dim of state.discoveredDimensions) {
      const coverage = state.dimensionCoverage?.[dim] ?? {};
      let mark: string;
      if (coverage.saturated) mark = '✓✓';
      else if (coverage.searched) mark = '✓';
      else mark = '○';
      lines.push(`  ${mark} ${dim}`);
    }

    const unsatisfied = state.discoveredDimensions.filter(
      (d) => !state.dimensionCoverage?.[d]?.searched
    );
    if (unsatisfied.length > 0) {
      lines.push(
        `Gap: ${unsatisfied.length} dimension(s) not yet searched: ${unsatisfied.join(', ')}`
      );
    } else {
      lines.push('All dimensions searched. If low info gain on recent searches → @answer.');
      return lines.join('\n');
    }
  } else {
    lines.push(
      'Compare the Goal/Plan above against collected chunks. ' +
        'Identify which aspects are well-covered and which have gaps.'
    );
    lines.push('- All aspects covered → call @answer.');
    lines.push('- Gaps remain → choose the best next action:');
  }

  // 5. 可用动作提示
  const toolHints: Record<string, string> = {
    search: 'search with different keywords or relaxed conditions',
    query_rewrite: 'rewrite or decompose the query from a new angle, then search the variants'
  };
  for (const name of toolNames) {
    if (name === 'answer') continue;
    const hint = toolHints[name] || `use @${name}`;
    lines.push(`  • @${name} — ${hint}`);
  }

  // ── 低相关性警告（注入 ⚠️ 信号，引导 agent 主动调 @answer）──────────
  if (state.allChunks.length > 0 && (state.searchCount ?? 0) > 0) {
    const bestBGE = Math.max(...state.allChunks.map((c) => c.rerankScore ?? c.score ?? 0));
    const llmScores = state.allChunks
      .map((c) => c.llm_sub_query_score)
      .filter((s): s is number => s !== undefined);
    const bestLLM = llmScores.length > 0 ? Math.max(...llmScores) : null;

    const isLowRelevance =
      bestLLM !== null ? bestLLM < IRRELEVANT_LLM_THRESHOLD : bestBGE < IRRELEVANT_BGE_THRESHOLD;

    if (isLowRelevance) {
      const scoreInfo =
        bestLLM !== null
          ? `LLM score: ${bestLLM.toFixed(0)}/10`
          : `BGE score: ${bestBGE.toFixed(3)}`;
      lines.push('');
      lines.push(
        `⚠️ RELEVANCE WARNING: All retrieved chunks have very low relevance (${scoreInfo}).` +
          ` If this query appears UNRELATED to this knowledge base domain,` +
          ` call @answer immediately — do NOT search or rewrite again.`
      );
    }
  }

  return lines.join('\n');
}

/** 合并 chunks（与 state reducer 一致，用于构建 Blackboard Brief 时的临时合并） */
function mergeChunks(existing: ChunkItem[], newItems: ChunkItem[]): ChunkItem[] {
  const merged = [...existing];
  const existingIds = new Map(merged.map((c, i) => [c.id, i]));
  for (const chunk of newItems) {
    const idx = existingIds.get(chunk.id);
    if (idx === undefined) {
      existingIds.set(chunk.id, merged.length);
      merged.push(chunk);
    } else {
      const cur = merged[idx];
      if ((chunk.rerankScore ?? chunk.score ?? 0) > (cur.rerankScore ?? cur.score ?? 0)) {
        merged[idx] = chunk;
      }
    }
  }
  return merged;
}

function formatSearchSummary(chunks: ChunkItem[], prevTotal: number): string {
  if (chunks.length === 0) {
    return 'Search complete. No relevant results found.';
  }

  const total = prevTotal + chunks.length;
  const topScore = (chunks[0] as ChunkItem & { score?: number }).score ?? 1;
  const botScore = (chunks[chunks.length - 1] as ChunkItem & { score?: number }).score ?? 1;

  const lines = [
    `Search complete. Retrieved ${total} chunks total, found ${chunks.length} new results.`,
    `Highest relevance: ${topScore.toFixed(2)}, lowest: ${botScore.toFixed(2)}`,
    'Top results summary:'
  ];

  for (let i = 0; i < Math.min(5, chunks.length); i++) {
    const c = chunks[i];
    const snippet = (c.content || '').slice(0, 80).replace(/\n/g, ' ');
    lines.push(`  ${i + 1}. [${c.id}] ${snippet}...`);
  }

  return lines.join('\n');
}

// ============================================================
// 共享函数：runAnswerStream（供 @answer tool 分支和 generate_answer 节点共用）
// ============================================================

async function runAnswerStream(
  answerSkill: AnswerSkill,
  params: {
    query: string;
    chunks: ChunkItem[];
    history: LLMMessage[];
    analysis?: string;
    playbook?: string;
    startTime?: number;
    enableReflection?: boolean; // 默认 false（当前反思效果待优化）
    mode?: string;
  }
): Promise<{
  answer: string;
  confidence: number;
  citedIds: string[];
  reflectionLabel: string;
  reflectionReason: string;
  refuse: boolean;
  ttftMs?: number;
} | null> {
  const {
    query,
    chunks,
    history,
    analysis,
    playbook,
    startTime,
    enableReflection = false,
    mode = 'chat'
  } = params;

  type StreamDataType = {
    answer: string;
    confidence: number;
    citedIds: string[];
    reflectionLabel: string;
    reflectionReason: string;
    refuse: boolean;
    ttftMs?: number;
  };
  let streamData: StreamDataType | null = null;

  for await (const streamResult of answerSkill.executeStream({
    context: null as never,
    query,
    chunks,
    history,
    enableReflection,
    mode,
    analysis,
    playbook_hint: playbook,
    startTime: startTime ?? Date.now()
  })) {
    if (streamResult.success && streamResult.data) {
      streamData = streamResult.data as unknown as StreamDataType;
    }
  }

  return streamData;
}

// ============================================================
// route_playbook 节点
// ============================================================

/**
 * route_playbook 节点：分析问题，选择 playbook，初始化 messages
 */
export function createRoutePlaybookNode(
  providers: AgenticSearchProviders,
  config: Required<AgenticSearchConfig>
) {
  return async function routePlaybookNode(
    state: AgenticRAGStateType
  ): Promise<AgenticRAGUpdateType> {
    const startTime = Date.now();
    try {
      const routeResult = await routePlaybook(
        providers.llm,
        state.question,
        state.chatHistory,
        state.priorContext,
        true
      );

      const logger = providers.logger;
      logger?.info(
        `[route_playbook] ${routeResult.playbook}:${routeResult.method} (${Date.now() - startTime}ms)`
      );

      const historyInfo = extractChatHistoryInfo(state.chatHistory);

      // 检测问题语言，注入 language directive（对齐 Python）
      const userLang = detectLang(state.question);
      const baseSystemPrompt = getSystemPrompt(routeResult.playbook, config.searchOnly);
      const languageDirective = `\n\n[LANGUAGE DIRECTIVE] The user's current question is in **${userLang}**. You MUST write ALL search queries and your final answer in **${userLang}**.`;

      // 若有 priorContext，注入 system prompt 作为 Search Hints（对齐 Python playbook_router_node）
      const searchHints = state.priorContext
        ? `\n\n## Search Hints\n\n${state.priorContext}\nUse these hints to guide your initial search queries. IMPORTANT: These hints may be in a different language than the user's question. Always keep your search queries and answer in the user's question language.`
        : '';

      const systemMsg: LLMMessage = {
        role: 'system',
        content: baseSystemPrompt + searchHints + languageDirective
      };
      const userMsg: LLMMessage = {
        role: 'user',
        content: state.question
      };

      return {
        playbook: routeResult.playbook,
        messages: [systemMsg, userMsg],
        executionPath: [`route_playbook(${routeResult.playbook}:${routeResult.method})`],
        nodeHist: [{ node: 'route_playbook', toolCalls: [] }],
        findings:
          historyInfo.previousTopics.length > 0
            ? [`Prior topics: ${historyInfo.previousTopics.join(', ')}`]
            : []
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const userLang = detectLang(state.question);
      const searchHints = state.priorContext
        ? `\n\n## Search Hints\n\n${state.priorContext}\nUse these hints to guide your initial search queries. IMPORTANT: These hints may be in a different language than the user's question. Always keep your search queries and answer in the user's question language.`
        : '';
      const languageDirective = `\n\n[LANGUAGE DIRECTIVE] The user's current question is in **${userLang}**. You MUST write ALL search queries and your final answer in **${userLang}**.`;
      return {
        playbook: 'general',
        messages: [
          {
            role: 'system',
            content: getSystemPrompt('general', config.searchOnly) + searchHints + languageDirective
          },
          { role: 'user', content: state.question }
        ],
        error: `route_playbook error: ${errorMsg}`,
        executionPath: ['route_playbook(error)'],
        nodeHist: [{ node: 'route_playbook', toolCalls: [] }]
      };
    }
  };
}

// ============================================================
// native agent 节点
// ============================================================

/**
 * native agent 节点：使用 LLM function calling，从 toolCalls 获取意图
 */
export function createNativeAgentNode(
  providers: AgenticSearchProviders,
  config: Required<AgenticSearchConfig>
) {
  return async function nativeAgentNode(state: AgenticRAGStateType): Promise<AgenticRAGUpdateType> {
    if (
      state.iterationCount >= config.maxIterations ||
      state.toolCallCount >= config.maxToolCalls
    ) {
      return {
        pendingToolCalls: [],
        executionPath: ['native_agent(limit_reached)'],
        nodeHist: [{ node: 'native_agent', toolCalls: ['LIMIT'] }]
      };
    }

    try {
      const response = await providers.llm.chat(state.messages, {
        tools: TOOL_DEFINITIONS,
        temperature: 0.1,
        maxTokens: 4096
      });

      const assistantMsg: LLMMessage = { role: 'assistant', content: response.content };
      const toolCalls = response.toolCalls ?? [];
      const toolNames = toolCalls.map((tc) => tc.function.name);

      return {
        messages: [assistantMsg],
        pendingToolCalls: toolCalls,
        toolCallCount: state.toolCallCount + toolCalls.length,
        iterationCount: state.iterationCount + 1,
        llmInputTokens: response.usage?.inputTokens ?? 0,
        llmOutputTokens: response.usage?.outputTokens ?? 0,
        executionPath: [`native_agent(${toolNames.join(',') || 'no_tools'})`],
        nodeHist: [{ node: 'native_agent', toolCalls: toolNames }]
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        pendingToolCalls: [],
        error: `native_agent error: ${errorMsg}`,
        executionPath: ['native_agent(error)'],
        nodeHist: [{ node: 'native_agent', toolCalls: [] }]
      };
    }
  };
}

// ============================================================
// text ReAct agent 节点
// ============================================================

/**
 * text ReAct agent 节点：解析 @tool_name() 或 <tool_call> XML 格式
 */
export function createTextAgentNode(
  providers: AgenticSearchProviders,
  config: Required<AgenticSearchConfig>
) {
  return async function textAgentNode(state: AgenticRAGStateType): Promise<AgenticRAGUpdateType> {
    if (
      state.iterationCount >= config.maxIterations ||
      state.toolCallCount >= config.maxToolCalls
    ) {
      return {
        pendingToolCalls: [],
        executionPath: ['text_agent(limit_reached)'],
        nodeHist: [{ node: 'text_agent', toolCalls: ['LIMIT'] }]
      };
    }

    try {
      const response = await providers.llm.chat(state.messages, {
        temperature: 0.1,
        maxTokens: 4096
      });

      const assistantMsg: LLMMessage = { role: 'assistant', content: response.content };
      const parsedCalls = parseAllToolCalls(response.content);

      const toolCalls: ToolCall[] = parsedCalls.map((c, i) => ({
        id: `text_call_${Date.now()}_${i}`,
        type: 'function' as const,
        function: { name: c.name, arguments: JSON.stringify(c.args) }
      }));

      const toolNames = toolCalls.map((tc) => tc.function.name);

      if (toolCalls.length === 0) {
        return {
          messages: [assistantMsg],
          pendingToolCalls: [],
          iterationCount: state.iterationCount + 1,
          llmInputTokens: response.usage?.inputTokens ?? 0,
          llmOutputTokens: response.usage?.outputTokens ?? 0,
          executionPath: ['text_agent(no_tool_calls)'],
          nodeHist: [{ node: 'text_agent', toolCalls: [] }]
        };
      }

      return {
        messages: [assistantMsg],
        pendingToolCalls: toolCalls,
        toolCallCount: state.toolCallCount + toolCalls.length,
        iterationCount: state.iterationCount + 1,
        llmInputTokens: response.usage?.inputTokens ?? 0,
        llmOutputTokens: response.usage?.outputTokens ?? 0,
        executionPath: [`text_agent(${toolNames.join(',')})`],
        nodeHist: [{ node: 'text_agent', toolCalls: toolNames }]
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        pendingToolCalls: [],
        error: `text_agent error: ${errorMsg}`,
        executionPath: ['text_agent(error)'],
        nodeHist: [{ node: 'text_agent', toolCalls: [] }]
      };
    }
  };
}

// ============================================================
// auto agent 节点（native 优先，降级 text 解析）
// ============================================================

/**
 * auto agent 节点：native 优先，无 toolCalls 时降级 text 解析
 */
export function createAutoAgentNode(
  providers: AgenticSearchProviders,
  config: Required<AgenticSearchConfig>
) {
  return async function autoAgentNode(state: AgenticRAGStateType): Promise<AgenticRAGUpdateType> {
    const logger = getNodeLogger(providers);
    const startTime = Date.now();
    if (
      state.iterationCount >= config.maxIterations ||
      state.toolCallCount >= config.maxToolCalls
    ) {
      logger?.info(`[auto_agent] limit_reached (${Date.now() - startTime}ms)`);
      return {
        pendingToolCalls: [],
        executionPath: ['auto_agent(limit_reached)'],
        nodeHist: [{ node: 'auto_agent', toolCalls: ['LIMIT'] }]
      };
    }

    try {
      const response = await providers.llm.chat(state.messages, {
        tools: TOOL_DEFINITIONS,
        temperature: 0.1,
        maxTokens: 4096
      });

      const assistantMsg: LLMMessage = { role: 'assistant', content: response.content };
      let toolCalls: ToolCall[] = response.toolCalls ?? [];

      // native 无返回时降级 text 解析
      if (toolCalls.length === 0 && response.content) {
        const parsedCalls = parseAllToolCalls(response.content);
        toolCalls = parsedCalls.map((c, i) => ({
          id: `auto_call_${Date.now()}_${i}`,
          type: 'function' as const,
          function: { name: c.name, arguments: JSON.stringify(c.args) }
        }));
      }

      const toolNames = toolCalls.map((tc) => tc.function.name);
      const mode = response.toolCalls?.length ? 'native' : 'text_fallback';

      logger?.info(
        `[auto_agent] ${mode},${toolNames.join(',') || 'no_tools'} (${Date.now() - startTime}ms)`
      );

      if (toolCalls.length === 0) {
        return {
          messages: [assistantMsg],
          pendingToolCalls: [],
          iterationCount: state.iterationCount + 1,
          llmInputTokens: response.usage?.inputTokens ?? 0,
          llmOutputTokens: response.usage?.outputTokens ?? 0,
          executionPath: [`auto_agent(${mode},no_tools)`],
          nodeHist: [{ node: 'auto_agent', toolCalls: [] }]
        };
      }

      return {
        messages: [assistantMsg],
        pendingToolCalls: toolCalls,
        toolCallCount: state.toolCallCount + toolCalls.length,
        iterationCount: state.iterationCount + 1,
        llmInputTokens: response.usage?.inputTokens ?? 0,
        llmOutputTokens: response.usage?.outputTokens ?? 0,
        executionPath: [`auto_agent(${mode},${toolNames.join(',')})`],
        nodeHist: [{ node: 'auto_agent', toolCalls: toolNames }]
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        pendingToolCalls: [],
        error: `auto_agent error: ${errorMsg}`,
        executionPath: ['auto_agent(error)'],
        nodeHist: [{ node: 'auto_agent', toolCalls: [] }]
      };
    }
  };
}

// ============================================================
// tools 节点
// ============================================================

/**
 * tools 节点：执行 pendingToolCalls（search / query_rewrite / answer）
 */
export function createToolsNode(
  providers: AgenticSearchProviders,
  skills: SkillBundle,
  config: Required<AgenticSearchConfig>,
  ctx: RequestContext
) {
  return async function toolsNode(state: AgenticRAGStateType): Promise<AgenticRAGUpdateType> {
    const logger = getNodeLogger(providers);
    const startTime = Date.now();
    const toolCalls = state.pendingToolCalls;
    if (toolCalls.length === 0) {
      return { pendingToolCalls: [], executionPath: ['tools(empty)'] };
    }

    const toolMessages: LLMMessage[] = [];
    let newChunks: ChunkItem[] = [];
    const newSearchQueries: string[] = [];
    let answer = '';
    let confidence = 0;
    let citedIds: string[] = [];
    let reflectionLabel = '';
    let reflectionReason = '';
    let refuse = false;
    let done = false;
    let ttftMs: number | undefined;
    let searchCountInc = 0;
    let embeddingTokensInc = 0;
    let rerankInputTokensInc = 0;
    const toolNames: string[] = [];
    let rewriteQueries: string[] | undefined;
    let lastSearchOverlap = 0;
    // searchOnly 模式：chunk selector 选出的最终 chunks
    let selectedChunks: ChunkItem[] | undefined;
    // 对比分析：对象列表（comparative_analysis playbook 专用）
    let compareObjectsUpdate: string[] | undefined;
    // 对比分析维度覆盖更新（comparative_analysis playbook 专用）
    const dimensionCoverageUpdate: Record<string, { searched?: boolean; saturated?: boolean }> = {};
    // @assess 状态更新暂存
    let assessUpdate: {
      findings: string[];
      lacks: string[];
      keyChunkAnnotations: Record<string, string | null>;
      prevLacksSet: string;
    } | null = null;
    // @query_rewrite 执行计划（plan_executor 节点使用）
    let pendingPlan: PlanStep[] | undefined;

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      toolNames.push(toolName);

      let toolArgs: Record<string, unknown> = {};
      try {
        toolArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        toolArgs = {};
      }

      let toolResult = '';

      try {
        switch (toolName) {
          case TOOLS.SEARCH: {
            const rawQueries = toolArgs.queries as string[] | undefined;
            const rawQuery = toolArgs.query as string | undefined;
            // 使用 parseSearchQueries 对齐 Python parse_search_queries
            const queryInput = rawQueries?.length
              ? JSON.stringify(rawQueries)
              : rawQuery || state.question;
            const parsedQueries = parseSearchQueries(queryInput);

            if (!parsedQueries || parsedQueries.length === 0) {
              toolResult = 'Empty query. Please provide a search query.';
              break;
            }

            logger?.info(
              `[ToolsNode] @search requested: queries=${JSON.stringify(parsedQueries)}, existingSearchQueries=${JSON.stringify(state.searchQueries)}`
            );

            // Filter out already-searched queries (exact match) - 对齐 Python
            const filteredByExact: string[] = [];
            for (const q of parsedQueries) {
              if (!(state.searchQueries as string[]).includes(q)) {
                filteredByExact.push(q);
              } else {
                logger?.info(`[ToolsNode] Skipping exact-match query '${q}'`);
              }
            }
            if (filteredByExact.length === 0) {
              const already = parsedQueries.join(', ');
              logger?.info(`[ToolsNode] ALL queries blocked by exact match, breaking`);
              toolResult = `Already searched for ${already}. Please use different keywords.`;
              break;
            }

            // Filter out queries too similar to previous searches (fuzzy dedup) - 对齐 Python is_similar_query
            const dedupedQueries: string[] = [];
            for (const q of filteredByExact) {
              const similar = isSimilarQuery(q, state.searchQueries as string[]);
              if (similar) {
                logger?.info(
                  `[ToolsNode] Skipping similar query '${q}' (too close to '${similar}')`
                );
              } else {
                dedupedQueries.push(q);
              }
            }
            if (dedupedQueries.length === 0) {
              logger?.info(`[ToolsNode] ALL queries blocked by fuzzy dedup, breaking`);
              toolResult = `These queries are too similar to previous searches. Already searched: ${(state.searchQueries as string[]).join(', ')}. Try a substantially different angle or different keywords.`;
              break;
            }

            // 检查 search budget（对齐 Python max_search_calls）
            const remaining = config.maxSearchCalls - (state.searchCount || 0);
            if (remaining <= 0) {
              toolResult =
                'Search limit reached. Please generate the answer based on existing search results.';
              break;
            }
            const searchQueries = dedupedQueries.slice(0, remaining);

            newSearchQueries.push(...searchQueries);

            const result = await skills.searchSkill.execute({
              context: null as never,
              queries: searchQueries,
              datasetIds: state.datasetIds,
              tokenBudget: config.tokenBudget,
              enableRerank: !!providers.reranker,
              topK: config.rerankTopK,
              originalQuery: state.question
            });

            if (result.success && result.data) {
              const data = result.data as {
                chunks: ChunkItem[];
                embeddingTokens?: number;
                rerankInputTokens?: number;
              };
              newChunks = data.chunks;
              embeddingTokensInc += data.embeddingTokens ?? 0;
              rerankInputTokensInc += data.rerankInputTokens ?? 0;
              // 计算与已有 chunks 的重叠率（用于 simple_query 饱和检测）
              if (newChunks.length > 0) {
                const existingIds = new Set(state.allChunks.map((c) => c.id));
                const overlapCount = newChunks.filter((c) => existingIds.has(c.id)).length;
                lastSearchOverlap = overlapCount / newChunks.length;
              }
              logger?.info(
                `[ToolsNode] @search done: newChunks=${newChunks.length}, state.allChunks=${state.allChunks.length}, overlap=${(lastSearchOverlap * 100).toFixed(0)}%, contentSample="${newChunks[0]?.content?.slice(0, 60) ?? 'empty'}"`
              );
              searchCountInc++;
              toolResult = formatSearchSummary(data.chunks, state.allChunks.length);

              // ===== Stage 1 sub-query filter（对齐 Python sub_query_filter()）=====
              const selectorCfg = skills.chunkSelectorSkill.getConfig();
              if (
                selectorCfg.useLLMSubQuery &&
                STAGE1_ENABLED_PLAYBOOKS.has(state.playbook) &&
                newChunks.length > 0 &&
                providers.llm
              ) {
                for (const q of searchQueries) {
                  newChunks = await subQueryFilter(
                    newChunks,
                    state.question,
                    q,
                    state.analysis,
                    providers.llm,
                    selectorCfg.llmSubQueryKeepTopK,
                    state.playbook,
                    selectorCfg.maxDocLength
                  );
                }
                logger?.info(`[ToolsNode] after subQueryFilter: newChunks=${newChunks.length}`);
              }

              // ===== 对比查询：更新维度覆盖状态（对齐 Python tools.py 第 164-197 行）=====
              if (
                state.playbook === 'comparative_analysis' &&
                state.discoveredDimensions &&
                state.discoveredDimensions.length > 0
              ) {
                for (const q of searchQueries) {
                  const qLower = q.toLowerCase();
                  for (const dim of state.discoveredDimensions) {
                    const coverage = state.dimensionCoverage?.[dim] ?? {};
                    if (coverage.saturated) continue;
                    const dimLower = dim.toLowerCase();
                    // 直接包含
                    if (qLower.includes(dimLower)) {
                      dimensionCoverageUpdate[dim] = { searched: true };
                      continue;
                    }
                    // 常见同义词扩展（对齐 Python _get_dimension_synonyms）
                    const synonyms = getDimensionSynonyms(dim);
                    for (const syn of synonyms) {
                      if (qLower.includes(syn.toLowerCase())) {
                        dimensionCoverageUpdate[dim] = { searched: true };
                        break;
                      }
                    }
                  }
                }
              }
            } else {
              toolResult = JSON.stringify({ error: result.error || 'Search failed' });
            }
            break;
          }

          case TOOLS.QUERY_REWRITE: {
            const rewriteQuery = (toolArgs.query as string) || state.question;
            const result = await skills.rewriteSkill.execute({
              context: null as never,
              query: rewriteQuery,
              history: state.chatHistory,
              priorContext: state.priorContext
            });

            if (result.success && result.data) {
              const data = result.data as QueryRewriteResult;
              // 注意：rewrite 生成的查询只存入 rewriteQueries（用于进度显示 ✓/○），
              // 不能写入 newSearchQueries/state.searchQueries，否则会被精确匹配 block 导致无法实际搜索。
              // 实际搜索由 plan_executor 或 agent 后续调用 @search 完成。
              rewriteQueries = data.queries;

              // ===== 构建 PlanStep 执行计划（对齐 Python tools.py 第 483-499 行）=====
              if (data.rewrites && data.rewrites.length > 0) {
                pendingPlan = data.rewrites.map(
                  (item) =>
                    ({
                      step: item.step ?? 1,
                      strategy: item.strategy ?? '',
                      queries: item.queries ?? [],
                      parallel: item.parallel ?? true,
                      depends_on: item.depends_on ?? null,
                      note: item.note ?? '',
                      executed: false,
                      failed: false
                    }) as PlanStep
                );
                logger?.info(
                  `[ToolsNode] @query_rewrite: created plan with ${pendingPlan.length} steps`
                );
              }

              // ===== 对比查询元数据提取（对齐 Python tools.py 第 502-539 行）=====
              // decompose 策略可能在 data 中携带 compare_objects, explicit_dimensions, implicit_dimensions
              const rawData = data as unknown as Record<string, unknown>;
              if (state.playbook === 'comparative_analysis') {
                // 提取对比对象（compare_objects）
                const compareObjs = (rawData.compare_objects as string[]) ?? [];
                if (compareObjs.length > 0) {
                  compareObjectsUpdate = compareObjs;
                }

                // 提取显式维度和隐式维度
                const explicitDims = (rawData.explicit_dimensions as string[]) ?? [];
                const implicitDims = (rawData.implicit_dimensions as string[]) ?? [];
                const allNewDims = [...explicitDims, ...implicitDims];
                for (const dim of allNewDims) {
                  if (!(state.discoveredDimensions ?? []).includes(dim)) {
                    // 将在 return 时通过 discoveredDimensions append 更新
                    dimensionCoverageUpdate[dim] = { searched: false, saturated: false };
                  }
                }
              }

              // 使用 formatRewriteSummary 生成带 parallel 提示的可读摘要（对齐 Python）
              toolResult = formatRewriteSummary(data);
            } else {
              toolResult = JSON.stringify({ error: result.error || 'Query rewrite failed' });
            }
            break;
          }

          case TOOLS.ANSWER: {
            const allChunksForAnswer = [...state.allChunks, ...newChunks];
            logger?.info(
              `[ToolsNode] @answer: state.allChunks=${state.allChunks.length}, newChunks=${newChunks.length}, allChunksForAnswer=${allChunksForAnswer.length}`
            );

            // 提取 pinnedChunkIds（@assess 标注的 key chunks 优先保留）
            const existingIdsForAnswer = new Set(allChunksForAnswer.map((c) => c.id));
            const pinnedChunkIds = Object.keys(state.keyChunkAnnotations ?? {}).filter((id) =>
              existingIdsForAnswer.has(id)
            );

            // skipStage2：1 轮搜索 + Stage1 已跑过时跳过 LLM rerank（对齐 select_chunks 节点）
            const answerSkipStage2 =
              state.searchCount === 1 && STAGE1_ENABLED_PLAYBOOKS.has(state.playbook);

            const selectResult = await skills.chunkSelectorSkill.execute({
              context: null as never,
              query: state.question,
              chunks: allChunksForAnswer,
              tokenBudget: config.tokenBudget,
              playbook: state.playbook,
              pinnedChunkIds,
              ...(answerSkipStage2 ? { enableLLMRerank: false } : {})
            });

            let finalChunks = allChunksForAnswer;
            if (selectResult.success && selectResult.data) {
              const data = selectResult.data as { selectedChunks: ChunkItem[] };
              finalChunks = data.selectedChunks;
            }
            logger?.info(
              `[ToolsNode] @answer: chunk selection done: selected ${finalChunks.length}/${allChunksForAnswer.length} chunks (skipStage2=${answerSkipStage2}, pinned=${pinnedChunkIds.length})`
            );

            // ── searchOnly 模式：跳过 LLM 生成，直接返回 selector 结果 ──
            if (config.searchOnly) {
              done = true;
              selectedChunks = finalChunks;
              toolResult = JSON.stringify({
                search_only: true,
                selected_chunks: finalChunks.length
              });
              logger?.info(
                `[ToolsNode] @answer(search_only): selected ${finalChunks.length} chunks, skipping LLM generation`
              );
              break;
            }

            const streamData = await runAnswerStream(skills.answerSkill, {
              query: state.question,
              chunks: finalChunks,
              history: state.chatHistory,
              analysis: state.analysis,
              playbook: state.playbook,
              startTime: state.startTime
            });

            if (streamData) {
              answer = streamData.answer;
              confidence = streamData.confidence;
              citedIds = streamData.citedIds;
              reflectionLabel = streamData.reflectionLabel;
              reflectionReason = streamData.reflectionReason;
              refuse = streamData.refuse;
              ttftMs = streamData.ttftMs;

              // 对齐 Python tools.py format_references 逻辑
              if (config.enableShowReferences && finalChunks.length > 0) {
                const referencesStr = formatReferences(finalChunks);
                if (referencesStr) {
                  (newChunks as unknown as { _references?: string })._references = referencesStr;
                }
              }

              done = true;

              if (ttftMs !== undefined) {
                logger?.info(`[ToolsNode] @answer TTFT: ${ttftMs}ms`);
              }

              toolResult = formatAnswerSummary({
                answer: streamData.answer,
                citedIds: streamData.citedIds,
                confidence: streamData.confidence,
                reflectionLabel: streamData.reflectionLabel,
                reflectionReason: streamData.reflectionReason,
                refuse: streamData.refuse
              });
            } else {
              toolResult = JSON.stringify({ error: 'Answer generation failed' });
            }
            break;
          }

          case TOOLS.ASSESS: {
            // @assess 工具 - 仅 deep_research / troubleshooting / comparative_analysis 有效
            const _ASSESS_PLAYBOOKS = new Set([
              'deep_research',
              'troubleshooting',
              'comparative_analysis'
            ]);
            if (!_ASSESS_PLAYBOOKS.has(state.playbook)) {
              toolResult = `@assess is not applicable for '${state.playbook}' queries. Call @answer directly now.`;
              break;
            }

            const assessFindings = (toolArgs.findings as string[]) || [];
            const assessLacks = (toolArgs.lacks as string[]) || [];
            const assessSufficient = toolArgs.sufficient as boolean;
            const assessKeyChunks =
              (toolArgs.key_chunks as Array<{ chunk_id: string; key_info?: string | null }>) || [];

            // findings 去重追加（写入 state 通过 update 合并）
            const existingFindingsSet = new Set(state.findings || []);
            const newFindings = assessFindings.filter((f) => !existingFindingsSet.has(f));

            // key_chunk_annotations 更新
            const keyChunkUpdate: Record<string, string | null> = {};
            for (const ann of assessKeyChunks) {
              keyChunkUpdate[ann.chunk_id] = ann.key_info ?? null;
            }

            // lacks 稳定性检测（连续两轮相同 lacks → 强制 @answer）
            const currLacksStr = [...assessLacks].sort().join('||');
            const prevLacksStr = state.prevLacksSet || '';
            let forcedAnswer = false;
            if (prevLacksStr && currLacksStr === prevLacksStr) {
              logger?.warn('[ToolsNode] @assess: lacks unchanged for 2 rounds — forcing @answer');
              forcedAnswer = true;
              toolResult =
                'Assessment: lacks unchanged from last round — the knowledge base does not have more relevant information. ' +
                'Call @answer now with the information you have collected.';
            } else if (assessSufficient) {
              toolResult =
                'Assessment: sufficient. You have enough information. Call @answer now to generate the final response.';
            } else {
              const lacksStr =
                assessLacks.length > 0
                  ? assessLacks.map((la) => `- ${la}`).join('\n')
                  : '(none specified)';
              toolResult =
                `Assessment recorded. Lacks noted in blackboard:\n${lacksStr}\n` +
                'Continue with your plan. When you have covered the main aspects, call @answer — ' +
                'you do NOT need to fill every lack before answering.';
            }

            logger?.info(
              `[ToolsNode] @assess: findings+${newFindings.length} (total=${(state.findings?.length || 0) + newFindings.length}), ` +
                `lacks=${assessLacks.length}, sufficient=${assessSufficient}, key_chunks=${assessKeyChunks.length}, forced=${forcedAnswer}`
            );

            // 写回 state 增量
            if (newFindings.length > 0) {
              (newChunks as unknown as { _assessFindings?: string[] })._assessFindings =
                newFindings;
            }
            // NOTE: findings/lacks/keyChunkAnnotations/prevLacksSet 通过 update 写回
            // 暂存到 assessUpdate 供后续合并
            assessUpdate = {
              findings: newFindings,
              lacks: assessLacks,
              keyChunkAnnotations: keyChunkUpdate,
              prevLacksSet: currLacksStr
            };
            break;
          }

          default:
            toolResult = JSON.stringify({ error: `Unknown tool: ${toolName}` });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        toolResult = JSON.stringify({ error: errorMsg });
      }

      toolMessages.push({
        role: 'user',
        content: `Tool @${toolName} returned:\n${toolResult}`
      });

      if (done) break;
    }

    // 注入 Blackboard Brief（对齐 Python sync_blackboard 节点）
    // 使用固定 id="progress-guidance"，通过 messages reducer 实现原地替换（避免 token 膨胀）
    if (!done) {
      const availableTools = [TOOLS.SEARCH, TOOLS.QUERY_REWRITE];
      const mergedChunks = mergeChunks(state.allChunks, newChunks);
      const mergedDimCoverage = { ...state.dimensionCoverage, ...dimensionCoverageUpdate };
      const stateForBrief = {
        ...state,
        allChunks: mergedChunks,
        searchCount: state.searchCount + searchCountInc,
        searchQueries: [...state.searchQueries, ...newSearchQueries],
        rewriteQueries: rewriteQueries ?? state.rewriteQueries,
        lastSearchOverlap,
        dimensionCoverage: mergedDimCoverage
      };
      const guidance = buildProgressGuidance(stateForBrief, config.maxSearchCalls, availableTools);
      toolMessages.push({ role: 'user', content: guidance, id: 'progress-guidance' });
    }

    // 更新 ctx（Blackboard 模式，对齐 Python tools 直接修改 ctx）
    if (newChunks.length > 0) {
      // 追加 chunks 到 ctx.allChunks（去重）
      for (const chunk of newChunks) {
        if (!ctx.allChunks.some((c) => c.id === chunk.id)) {
          ctx.allChunks.push(chunk);
        }
      }
    }
    // 更新搜索计数
    if (searchCountInc > 0) {
      ctx.searchCount += searchCountInc;
      // 保存最近一次搜索的 chunks（用于信息增益计算）
      ctx.lastSearchChunks = newChunks;
      // 计算重叠率
      if (newChunks.length > 0) {
        const existingIds = new Set(ctx.allChunks.map((c) => c.id));
        const overlapCount = newChunks.filter((c) => existingIds.has(c.id)).length;
        ctx.lastSearchOverlap = overlapCount / newChunks.length;
      }
      // 更新连续不相关搜索计数器
      // 使用 Stage1 过滤后的 newChunks（已含 llm_sub_query_score）
      const irrelevant = isSearchIrrelevant(newChunks);
      ctx.consecutiveIrrelevantSearches = irrelevant ? ctx.consecutiveIrrelevantSearches + 1 : 0;
      if (irrelevant) {
        providers.logger?.info(
          `[ToolsNode] irrelevant search detected (consecutive=${ctx.consecutiveIrrelevantSearches}), bestScore=${
            newChunks.length > 0
              ? Math.max(...newChunks.map((c) => c.rerankScore ?? c.score ?? 0)).toFixed(3)
              : 'N/A'
          }`
        );
      }
    }
    // 追加搜索查询
    for (const q of newSearchQueries) {
      if (!ctx.searchQueries.includes(q)) {
        ctx.searchQueries.push(q);
      }
    }
    // 保存 playbook 到 ctx
    if (state.playbook) {
      ctx.playbook = state.playbook;
    }

    logger?.info(`[tools] ${toolNames.join(',')} (${Date.now() - startTime}ms)`);

    return {
      messages: toolMessages,
      allChunks: newChunks,
      searchQueries: newSearchQueries,
      pendingToolCalls: [],
      ...(rewriteQueries !== undefined ? { rewriteQueries } : {}),
      ...(searchCountInc > 0 ? { lastSearchOverlap } : {}),
      ...(Object.keys(dimensionCoverageUpdate).length > 0
        ? { dimensionCoverage: dimensionCoverageUpdate }
        : {}),
      ...(compareObjectsUpdate ? { compareObjects: compareObjectsUpdate } : {}),
      ...(answer
        ? { answer, confidence, citedIds, reflectionLabel, reflectionReason, refuse, ttftMs }
        : {}),
      // searchOnly 模式：记录 chunk selector 选出的最终结果
      ...(selectedChunks ? { selectedChunks } : {}),
      // @assess 状态写回（findings 追加，lacks 替换，key annotations 合并）
      ...(assessUpdate
        ? {
            findings: assessUpdate.findings,
            lacks: assessUpdate.lacks,
            keyChunkAnnotations: assessUpdate.keyChunkAnnotations,
            prevLacksSet: assessUpdate.prevLacksSet
          }
        : {}),
      // @query_rewrite 执行计划（供 plan_executor 节点消费）
      ...(pendingPlan !== undefined ? { pendingPlan } : {}),
      done,
      searchCount: state.searchCount + searchCountInc,
      ...(embeddingTokensInc > 0 ? { embeddingTokens: embeddingTokensInc } : {}),
      ...(rerankInputTokensInc > 0 ? { rerankInputTokens: rerankInputTokensInc } : {}),
      // 当 @answer tool 在 searchOnly 模式下显式运行了 chunk selection（selectedChunks 被设置，
      // 即使为空数组），注入 select_chunks(from_answer) 到 executionPath，供 mapStateToResult
      // 正确区分"selection 运行过返回空"与"selection 从未运行"。
      executionPath: [
        `tools(${toolNames.join(',')})`,
        ...(selectedChunks !== undefined ? ['select_chunks(from_answer)'] : [])
      ],
      nodeHist: [{ node: 'tools', toolCalls: toolNames }]
    };
  };
}

// ============================================================
// 条件边
// ============================================================

/**
 * createShouldContinue：工厂函数，创建条件边函数
 * 对齐 Python create_should_continue，需要访问 ctx 以判断 last_answer、search_count 等
 */
export function createShouldContinue(config: Required<AgenticSearchConfig>, ctx: RequestContext) {
  return function shouldContinue(state: AgenticRAGStateType): string {
    // 检查是否有工具调用
    // 无工具调用时路由到 select_chunks 而非 END，确保已收集的 chunks 能生成回答
    if (!state.pendingToolCalls || state.pendingToolCalls.length === 0) {
      return 'select_chunks';
    }

    // 检查 ctx.last_answer 是否已有答案（@answer 上一轮已完成）
    if (ctx.lastAnswer && ctx.lastAnswer.answer) {
      return END;
    }

    // 检查 tool_call_count 是否达到上限 → select_chunks 确保已收集 chunks 生成回答
    const toolCallCount = state.toolCallCount ?? 0;
    if (toolCallCount >= config.maxToolCalls) {
      return 'select_chunks';
    }

    // 检查 search_count 是否达到上限（仅当全部是 search 工具调用时）→ select_chunks
    const toolNames = state.pendingToolCalls.map((tc) => tc.function.name);
    if (ctx.searchCount >= config.maxSearchCalls) {
      if (toolNames.every((name) => name === TOOLS.SEARCH)) {
        return 'select_chunks';
      }
    }

    // simple_query 早退机制（对齐 Python simple_query_search_capped）
    // 高分命中/饱和时不再搜索，直接进入 chunk 筛选
    if (toolNames.every((name) => name === TOOLS.SEARCH)) {
      const reason = simpleQuerySearchCappedWithCtx(ctx);
      if (reason) {
        return 'select_chunks';
      }
    }

    return 'tools';
  };
}

/**
 * simpleQuerySearchCappedWithCtx：从 ctx 读取状态判断是否早退
 * 对齐 Python simple_query_search_capped，包含三个信号：
 * 1. 高分命中 (score >= 0.7)
 * 2. 搜索空间饱和 (overlap >= 70%)
 * 3. 信息增益低 (新 chunk 相比历史 chunks 信息增益 < threshold)
 */
function simpleQuerySearchCappedWithCtx(ctx: RequestContext): string | null {
  if (ctx.playbook !== 'simple_query') return null;
  if (!ctx.allChunks || ctx.searchCount < 1) return null;

  // 信号1: 高分命中
  const bestScore = Math.max(...ctx.allChunks.map((c) => c.rerankScore ?? c.score ?? 0));
  if (bestScore >= SIMPLE_QUERY_HIGH_SCORE) {
    return `high-score chunk found (best=${bestScore.toFixed(3)} >= ${SIMPLE_QUERY_HIGH_SCORE}) after ${ctx.searchCount} searches`;
  }

  // 信号2: 搜索空间饱和
  if (ctx.lastSearchOverlap >= SIMPLE_QUERY_OVERLAP_THRESHOLD) {
    return `search space saturated (overlap=${(ctx.lastSearchOverlap * 100).toFixed(0)}% on last search)`;
  }

  // 信号3: 信息增益低（需要 config 中的 enableInfoGain 和 lastSearchChunks）
  const cfg = ctx.config;
  if (cfg.enableInfoGain && ctx.lastSearchChunks && ctx.lastSearchChunks.length > 0) {
    const gainCalc = new InformationGainCalculator(cfg.infoGainMaxHistory ?? 10);
    // 用已有的前 N 个 chunk 作为历史
    const historySize = Math.min(ctx.allChunks.length, cfg.infoGainMaxHistory ?? 10);
    for (let i = 0; i < historySize; i++) {
      gainCalc.addSelected(ctx.allChunks[i]);
    }
    // 计算最近搜索返回的 chunks 的信息增益
    const infoGains = ctx.lastSearchChunks.map((c) => gainCalc.computeInfoGain(c));
    const maxGain = Math.max(...infoGains, 0);
    const threshold = cfg.infoGainThreshold ?? 0.1;
    if (maxGain < threshold) {
      return `low info gain (max=${maxGain.toFixed(3)} < ${threshold}) on last search`;
    }
  }

  return null;
}

// ============================================================
// select_chunks 节点
// ============================================================

/**
 * select_chunks 节点：从 allChunks 筛选最终用于回答的 chunks，写入 state.selectedChunks
 * - skipStage2: searchCount === 1 且 Stage 1 已跑过时，跳过 Stage 2 LLM rerank
 * - pinnedChunkIds: 从 keyChunkAnnotations 提取，确保 @assess 标注的 key chunks 不被过滤
 */
export function createSelectChunksNode(
  providers: AgenticSearchProviders,
  skills: SkillBundle,
  config: Required<AgenticSearchConfig>
) {
  return async function selectChunksNode(
    state: AgenticRAGStateType
  ): Promise<AgenticRAGUpdateType> {
    const logger = getNodeLogger(providers);

    // 守卫：已有答案（@answer tool 已生成）
    if (state.answer) {
      return {};
    }

    // 守卫：无 chunks
    if (state.allChunks.length === 0) {
      logger?.warn('[select_chunks] No chunks collected, skipping');
      return {};
    }

    // skipStage2：1 轮搜索结束，Stage 1 已跑过所有 chunks，无需再跑 Stage 2
    const skipStage2 = state.searchCount === 1 && STAGE1_ENABLED_PLAYBOOKS.has(state.playbook);

    // 提取 pinnedChunkIds（对齐 Python tools.py）
    const existingIds = new Set(state.allChunks.map((c) => c.id));
    const pinnedChunkIds = Object.keys(state.keyChunkAnnotations ?? {}).filter((id) =>
      existingIds.has(id)
    );

    const selectResult = await skills.chunkSelectorSkill.execute({
      context: null as never,
      query: state.question,
      chunks: state.allChunks,
      tokenBudget: config.tokenBudget,
      playbook: state.playbook,
      pinnedChunkIds,
      ...(skipStage2 ? { enableLLMRerank: false } : {})
    });

    const selectedChunks =
      selectResult.success && selectResult.data
        ? (selectResult.data as { selectedChunks: ChunkItem[] }).selectedChunks
        : state.allChunks;

    logger?.info(
      `[select_chunks] selected ${selectedChunks.length}/${state.allChunks.length} chunks (skipStage2=${skipStage2}, pinned=${pinnedChunkIds.length})`
    );

    // 有检索结果但 chunk_selector 判定全部不相关 → 标记 refuse
    const noRelevantChunks = selectedChunks.length === 0 && (state.allChunks?.length ?? 0) > 0;

    return {
      selectedChunks,
      ...(noRelevantChunks ? { refuse: true } : {}),
      ...(config.searchOnly ? { done: true } : {}),
      executionPath: [`select_chunks(${skipStage2 ? 'skip_stage2' : 'stage2'})`],
      nodeHist: [{ node: 'select_chunks', toolCalls: [] }]
    };
  };
}

// ============================================================
// generate_answer 节点
// ============================================================

/**
 * generate_answer 节点：读取 selectedChunks（fallback allChunks），调 runAnswerStream 生成答案
 */
export function createGenerateAnswerNode(
  providers: AgenticSearchProviders,
  skills: SkillBundle,
  config: Required<AgenticSearchConfig>
) {
  return async function generateAnswerNode(
    state: AgenticRAGStateType
  ): Promise<AgenticRAGUpdateType> {
    const logger = getNodeLogger(providers);

    // 守卫：已有答案
    if (state.answer) {
      return {};
    }

    // search_only 防御性守卫（条件边已在 select_chunks 后截断，此处仅兜底）
    if (config.searchOnly) {
      return {
        done: true,
        executionPath: ['generate_answer(search_only)'],
        nodeHist: [{ node: 'generate_answer', toolCalls: [] }]
      };
    }

    const chunks = (() => {
      // 若 select_chunks 运行过，优先使用其结果（可能是 [] 代表全部不相关）
      const selectChunksRan = (state.executionPath ?? []).some((p) =>
        p.startsWith('select_chunks')
      );
      if (selectChunksRan) return state.selectedChunks ?? [];
      return state.selectedChunks?.length ? state.selectedChunks : state.allChunks;
    })();

    // 守卫：无 chunks（由 irrelevant query 早停路径触发）
    // 不调 LLM，直接返回标准 refuse 响应
    if (chunks.length === 0) {
      logger?.warn(
        '[generate_answer] No relevant chunks — query appears unrelated to knowledge base'
      );
      return {
        answer:
          'No relevant information found in the knowledge base for your question. Please try rephrasing with different keywords.',
        confidence: 0,
        refuse: true,
        reflectionLabel: 'irrelevant',
        reflectionReason: 'No relevant chunks after relevance filtering',
        citedIds: [],
        done: true,
        executionPath: ['generate_answer(no_relevant_chunks)'],
        nodeHist: [{ node: 'generate_answer', toolCalls: [] }]
      };
    }

    logger?.info(`[generate_answer] generating answer from ${chunks.length} chunks`);

    const streamData = await runAnswerStream(skills.answerSkill, {
      query: state.question,
      chunks,
      history: state.chatHistory,
      analysis: state.analysis,
      playbook: state.playbook,
      startTime: state.startTime
    });

    if (!streamData) {
      logger?.warn('[generate_answer] runAnswerStream returned null');
      return {
        executionPath: ['generate_answer(failed)'],
        nodeHist: [{ node: 'generate_answer', toolCalls: [] }]
      };
    }

    if (streamData.ttftMs !== undefined) {
      logger?.info(`[generate_answer] TTFT: ${streamData.ttftMs}ms`);
    }

    return {
      answer: streamData.answer,
      confidence: streamData.confidence,
      citedIds: streamData.citedIds,
      reflectionLabel: streamData.reflectionLabel,
      reflectionReason: streamData.reflectionReason,
      refuse: streamData.refuse,
      ttftMs: streamData.ttftMs,
      done: true,
      executionPath: ['generate_answer(generated)'],
      nodeHist: [{ node: 'generate_answer', toolCalls: [] }]
    };
  };
}

// ============================================================
// plan_executor 节点（对齐 Python create_plan_executor）
// ============================================================

const PLAN_EARLY_RETURN_MIN_CHUNKS = 5; // 对齐 Python plan_early_return_min_chunks

/**
 * 基于 score + 信息增益的质量网关，判断是否提前结束计划执行
 */
function shouldEarlyReturn(
  allChunks: ChunkItem[],
  newChunks: ChunkItem[],
  answerMaxChunks: number,
  infoGainThreshold: number
): boolean {
  if (allChunks.length < PLAN_EARLY_RETURN_MIN_CHUNKS) return false;
  if (!newChunks.length) return true;

  // Score 判断
  const existingScores = allChunks.map((c) => c.score ?? 0).sort((a, b) => b - a);
  const topK = Math.min(answerMaxChunks, existingScores.length);
  const avgTopScore = existingScores.slice(0, topK).reduce((s, v) => s + v, 0) / topK;
  const hasHighScore = newChunks.some((c) => (c.score ?? 0) >= avgTopScore);

  // 信息增益判断
  const gainCalc = new InformationGainCalculator(10);
  const histStart = Math.max(0, allChunks.length - 10);
  for (const c of allChunks.slice(histStart)) gainCalc.addSelected(c);
  const infoGains = newChunks.map((c) => gainCalc.computeInfoGain(c));
  const maxGain = Math.max(...infoGains, 0);
  const hasHighInfoGain = maxGain >= infoGainThreshold;

  return !hasHighScore && !hasHighInfoGain;
}

/**
 * plan_executor 节点：自动执行 @query_rewrite 生成的查询计划，无需 LLM 参与每步决策
 */
export function createPlanExecutorNode(
  providers: AgenticSearchProviders,
  skills: SkillBundle,
  config: Required<AgenticSearchConfig>,
  _ctx: RequestContext
) {
  return async function planExecutorNode(
    state: AgenticRAGStateType
  ): Promise<AgenticRAGUpdateType> {
    const logger = getNodeLogger(providers);
    const plan = [...(state.pendingPlan ?? [])];
    if (plan.length === 0) return {};

    logger?.info(`[plan_executor] Executing plan with ${plan.length} steps`);

    const stepsByOrder = [...plan].sort((a, b) => a.step - b.step);
    const executedSteps = new Set<number>();
    const failedSteps = new Set<number>();

    // 本次执行中累积的状态
    const accNewChunks: ChunkItem[] = [];
    const accSearchQueries: string[] = [];
    let searchCountInc = 0;
    // 合并所有 chunks（已有 + 本次）
    let mergedAllChunks = [...state.allChunks];

    for (const step of stepsByOrder) {
      const s = step as PlanStep & { executed?: boolean; failed?: boolean };
      if (s.executed) {
        executedSteps.add(s.step);
        if (s.failed) failedSteps.add(s.step);
        continue;
      }

      // 依赖步骤失败 → 跳过
      if (s.depends_on != null && failedSteps.has(s.depends_on)) {
        logger?.warn(
          `[plan_executor] Skipping step ${s.step}: dependency step ${s.depends_on} failed`
        );
        s.executed = true;
        s.failed = true;
        failedSteps.add(s.step);
        continue;
      }

      // search budget 检查
      const remaining = config.maxSearchCalls - (state.searchCount + searchCountInc);
      if (remaining <= 0) {
        logger?.info('[plan_executor] Search budget exhausted');
        break;
      }

      // exact match 去重
      const existingQSet = new Set([...state.searchQueries, ...accSearchQueries]);
      const newQueries = (s.queries || []).filter((q) => !existingQSet.has(q)).slice(0, remaining);
      if (newQueries.length === 0) {
        s.executed = true;
        executedSteps.add(s.step);
        continue;
      }

      try {
        logger?.info(`[plan_executor] Step ${s.step}: ${newQueries.join(', ')}`);

        const searchResult = await skills.searchSkill.execute({
          context: null as never,
          queries: newQueries,
          datasetIds: state.datasetIds,
          tokenBudget: config.tokenBudget,
          enableRerank: !!providers.reranker,
          topK: config.rerankTopK,
          originalQuery: state.question
        });

        let newChunks: ChunkItem[] = [];
        if (searchResult.success && searchResult.data) {
          const data = searchResult.data as { chunks: ChunkItem[] };
          newChunks = data.chunks;
        }

        // Stage 1 sub-query filter（对齐 Python）
        if (STAGE1_ENABLED_PLAYBOOKS.has(state.playbook) && newChunks.length > 0 && providers.llm) {
          const selectorCfg = skills.chunkSelectorSkill.getConfig();
          if (selectorCfg.useLLMSubQuery) {
            for (const q of newQueries) {
              newChunks = await subQueryFilter(
                newChunks,
                state.question,
                q,
                state.analysis,
                providers.llm,
                selectorCfg.llmSubQueryKeepTopK,
                state.playbook,
                selectorCfg.maxDocLength
              );
            }
          }
        }

        accNewChunks.push(...newChunks);
        accSearchQueries.push(...newQueries);
        searchCountInc += newQueries.length;

        // 更新 mergedAllChunks（smart merge）
        const existingIds = new Set(mergedAllChunks.map((c) => c.id));
        for (const c of newChunks) {
          if (!existingIds.has(c.id)) {
            mergedAllChunks.push(c);
            existingIds.add(c.id);
          } else {
            const idx = mergedAllChunks.findIndex((m) => m.id === c.id);
            if (idx >= 0) {
              const cur = mergedAllChunks[idx];
              if ((c.rerankScore ?? c.score ?? 0) > (cur.rerankScore ?? cur.score ?? 0)) {
                mergedAllChunks[idx] = c;
              }
            }
          }
        }

        s.executed = true;
        executedSteps.add(s.step);

        // 质量网关
        if (shouldEarlyReturn(mergedAllChunks, newChunks, 15, 0.1)) {
          logger?.info(`[plan_executor] Quality gate triggered after step ${s.step}, early return`);
          break;
        }
      } catch (e) {
        logger?.error(`[plan_executor] Step ${s.step} failed:`, {
          message: e instanceof Error ? e.message : String(e)
        });
        s.executed = true;
        s.failed = true;
        failedSteps.add(s.step);
      }
    }

    // 清理已完成步骤
    const remainingPlan = plan.filter((s) => !(s as PlanStep & { executed?: boolean }).executed);

    logger?.info(
      `[plan_executor] Done: ${executedSteps.size} executed, ${failedSteps.size} failed, ${remainingPlan.length} remaining`
    );

    return {
      allChunks: accNewChunks,
      searchQueries: accSearchQueries,
      searchCount: state.searchCount + searchCountInc,
      pendingPlan: remainingPlan,
      executionPath: [`plan_executor(${executedSteps.size} steps)`],
      nodeHist: [{ node: 'plan_executor', toolCalls: [] }]
    };
  };
}

/**
 * createAfterSyncRoute：工厂函数，创建 sync_blackboard 后的路由函数
 * 对齐 Python _create_after_sync_route，需要访问 ctx 以检查 pending_plan
 */
export function createAfterSyncRoute(ctx: RequestContext) {
  return function afterSyncRoute(state: AgenticRAGStateType): string {
    // 检查 state.done（可能在 agent 节点设置）
    if (state.done) {
      return END;
    }
    // 检查 ctx.pending_plan（由 query_rewrite 设置）
    if (ctx.pendingPlan && ctx.pendingPlan.length > 0) {
      return 'plan_executor';
    }
    // 对齐 Python _after_sync_route：始终回到 agent，让 LLM 决策下一步
    // Python 不在路由层做早停，由 createShouldContinue（工具调用前）和 LLM 自身决定
    return 'agent';
  };
}

// ============================================================
// sync_blackboard 节点（对齐 Python create_sync_blackboard）
// ============================================================

/**
 * 创建 sync_blackboard 节点（对齐 Python create_sync_blackboard）
 *
 * 当提供 cfg 和 tool_names 时，节点会向 messages 注入 progress-summary
 * + decision-guidance 消息，帮助 agent 评估是否继续搜索或调用 @answer
 */
export function createSyncBlackboardNode(
  ctx: RequestContext,
  config?: Required<AgenticSearchConfig>,
  toolNames?: string[]
) {
  return function syncBlackboardNode(_state: AgenticRAGStateType): AgenticRAGUpdateType {
    // 从 ctx 同步到 state
    // 注意：searchQueries 不在此同步，由 tools 节点通过 append reducer 正确累加。
    // 若在此返回 searchQueries: [...ctx.searchQueries]，会因 append reducer 导致重复追加。
    const updates: AgenticRAGUpdateType = {
      allChunks: [...ctx.allChunks],
      searchCount: ctx.searchCount,
      executionPath: ['sync_blackboard']
    };

    // 如果有 answer，同步 answer 相关字段
    if (ctx.lastAnswer) {
      const ans = ctx.lastAnswer;
      updates.answer = ans.answer;
      updates.citedIds = ans.citedIds;
      updates.confidence = ans.confidence;
      updates.reflectionLabel = ans.reflectionLabel || '';
      updates.reflectionReason = ans.reflectionReason || '';
      updates.refuse = ans.reflectionLabel === 'refuse';
      updates.nodeHist = [
        {
          node: 'answer',
          toolCalls: [],
          reflectionLabel: ans.reflectionLabel || '',
          reflectionReason: ans.reflectionReason || '',
          confidence: ans.confidence,
          citedIds: ans.citedIds
        }
      ];
      // 清空 last_answer（避免重复同步）
      ctx.lastAnswer = null;
    } else {
      updates.nodeHist = [
        {
          node: 'tools',
          toolCalls: [],
          searchCount: ctx.searchCount,
          chunksTotal: ctx.allChunks.length
        }
      ];

      // 注入 progress guidance（native graph only）
      if (config && toolNames && toolNames.length > 0) {
        // 构建 ctx 的兼容视图（用于 buildProgressGuidance）
        const ctxView = {
          analysis: ctx.analysis,
          playbook: ctx.playbook,
          compareObjects: ctx.compareObjects,
          discoveredDimensions: ctx.discoveredDimensions,
          dimensionCoverage: ctx.dimensionCoverage,
          comparePhase: ctx.comparePhase,
          rewriteQueries: ctx.rewriteQueries,
          searchQueries: ctx.searchQueries,
          searchCount: ctx.searchCount,
          allChunks: ctx.allChunks,
          findings: ctx.findings,
          lacks: ctx.lacks,
          keyChunkAnnotations: ctx.keyChunkAnnotations
        } as any; // 绕过 TypeScript 类型检查，直接传 ctx 视图
        // 使用本地 buildProgressGuidance（接受 state, maxSearchCalls, toolNames）
        const guidance = buildProgressGuidance(ctxView, config.maxSearchCalls, toolNames);
        // 使用固定 ID 替换之前的 guidance，避免消息历史膨胀
        updates.messages = [
          {
            role: 'user',
            content: guidance,
            id: 'progress-guidance'
          }
        ];
      }
    }

    return updates;
  };
}
