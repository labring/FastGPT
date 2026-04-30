// src/skills/atomic/chunk_selector.ts
// Chunk Selector Skill - 完整版：Stage 1 LLM 评分 + Stage 2 LLM 精排 + 信息增益 + 动态阈值 + pinned chunks

import type { SkillInput, SkillOutput } from '../base';
import { BaseSkill } from '../base';
import type { ChunkItem } from '../../types/chunk';
import type { LLMProvider } from '../../ports/llm';
import { getLogger } from '../../utils/logger';
import { fitChunks, estimateTokens } from '../../utils/token_budget';
import { InformationGainCalculator } from '../../utils/info_gain';
import {
  RERANKER_SUB_QUERY_PROMPT,
  getRerankPrompt
} from '../../prompts/atomic/chunk_selector_prompts';
import { IRRELEVANT_BGE_THRESHOLD, IRRELEVANT_LLM_THRESHOLD } from '../../utils/constants';

/**
 * Chunk Selector 选项
 */
export interface ChunkSelectorOptions {
  query: string;
  chunks: ChunkItem[];
  tokenBudget: number;
  playbook?: string;
  enableInfoGain?: boolean;
  enableLLMRerank?: boolean;
  stage1Threshold?: number;
  pinnedChunkIds?: string[];
  answerMaxChunks?: number;
}

/**
 * Chunk Selector 结果
 */
export interface ChunkSelectorResult {
  selectedChunks: ChunkItem[];
  totalTokens: number;
  stage: 1 | 2;
  llmScoreUsed?: boolean;
  infoGainFiltered?: number;
}

// Stage 1 启用的 playbooks（对齐 Python STAGE1_ENABLED_PLAYBOOKS）
export const STAGE1_ENABLED_PLAYBOOKS = new Set([
  'comparative_analysis',
  'deep_research',
  'simple_query',
  'troubleshooting'
]);

/**
 * Chunk Selector Skill - 完整版
 *
 * 流程：
 * 1. Stage 1: Token gate（粗筛）
 * 2. Stage 2: LLM 精排（使用 BGE score 排序后，调用 LLM 重评）
 * 3. Stage 3: 动态扩展（根据 Stage1 高分）
 * 4. Stage 4: 信息增益过滤（pinned chunk 跳过）
 * 5. Stage 5: 按最终 score 排序，返回 token budget 内的 chunks
 */
export class ChunkSelectorSkill extends BaseSkill {
  name = 'chunk_selector';
  description =
    'Select relevant chunks with full pipeline: LLM scoring, info gain, dynamic threshold, pinned chunks';

  private infoGainCalc?: InformationGainCalculator;
  private config = {
    // 对齐 Python ChunkSelectorConfig 默认值
    enableLLMRerank: false, // LLM Stage2 精排：开销大，默认关闭；CHUNK_SELECTOR_USE_LLM=true 开启
    maxDocLength: 30000,
    llmScoreThreshold: 4.0,
    enableInfoGain: true,
    infoGainThreshold: 0.2,
    infoGainMaxHistory: 10,
    useLLMSubQuery: false, // subQueryFilter LLM 评分：开销大，默认关闭；CHUNK_SELECTOR_USE_LLM_SUB_QUERY=true 开启
    llmSubQueryKeepTopK: 12, // Python: llm_sub_query_keep_top_k = 12
    // 内部扩展参数（无 Python 直接对应）
    stage1Threshold: 7.0,
    stage1HighScoreThreshold: 7.0,
    stage1ExpandMultiplier: 2
  };

  // Stage1 分数缓存
  private stage1ScoreCache: Map<string, number> = new Map();

  // Playbook 感知配置
  private playbookConfig: Record<
    string,
    { enableLLM: boolean; enableInfoGain: boolean; threshold: number }
  > = {
    simple_query: { enableLLM: true, enableInfoGain: true, threshold: 7.0 },
    comparative_analysis: { enableLLM: true, enableInfoGain: true, threshold: 6.5 },
    troubleshooting: { enableLLM: true, enableInfoGain: false, threshold: 7.0 },
    step_back: { enableLLM: false, enableInfoGain: true, threshold: 7.5 },
    planning: { enableLLM: true, enableInfoGain: true, threshold: 6.0 },
    general: { enableLLM: false, enableInfoGain: true, threshold: 7.0 }
  };

  initializeProvider(llm: LLMProvider): void {
    super.initialize(llm);
    this.loadFromEnv();
    this.infoGainCalc = new InformationGainCalculator(this.config.infoGainMaxHistory);
  }

  /**
   * 从环境变量加载配置（对齐 Python pydantic_settings，前缀 CHUNK_SELECTOR_）
   *
   * 支持的环境变量：
   *   CHUNK_SELECTOR_USE_LLM               (bool)
   *   CHUNK_SELECTOR_LLM_MAX_DOC_LENGTH    (int)
   *   CHUNK_SELECTOR_LLM_SCORE_THRESHOLD   (float)
   *   CHUNK_SELECTOR_ENABLE_INFO_GAIN      (bool)
   *   CHUNK_SELECTOR_INFO_GAIN_THRESHOLD   (float)
   *   CHUNK_SELECTOR_INFO_GAIN_MAX_HISTORY (int)
   *   CHUNK_SELECTOR_USE_LLM_SUB_QUERY     (bool)
   *   CHUNK_SELECTOR_LLM_SUB_QUERY_KEEP_TOP_K (int)
   */
  loadFromEnv(): void {
    const env = process.env;
    const parseBool = (v: string | undefined, def: boolean) =>
      v === undefined ? def : v.toLowerCase() === 'true' || v === '1';
    const parseFloat_ = (v: string | undefined, def: number) =>
      v === undefined ? def : parseFloat(v);
    const parseInt_ = (v: string | undefined, def: number) =>
      v === undefined ? def : parseInt(v, 10);

    this.config.enableLLMRerank = parseBool(
      env['CHUNK_SELECTOR_USE_LLM'],
      this.config.enableLLMRerank
    );
    this.config.maxDocLength = parseInt_(
      env['CHUNK_SELECTOR_LLM_MAX_DOC_LENGTH'],
      this.config.maxDocLength
    );
    this.config.llmScoreThreshold = parseFloat_(
      env['CHUNK_SELECTOR_LLM_SCORE_THRESHOLD'],
      this.config.llmScoreThreshold
    );
    this.config.enableInfoGain = parseBool(
      env['CHUNK_SELECTOR_ENABLE_INFO_GAIN'],
      this.config.enableInfoGain
    );
    this.config.infoGainThreshold = parseFloat_(
      env['CHUNK_SELECTOR_INFO_GAIN_THRESHOLD'],
      this.config.infoGainThreshold
    );
    this.config.infoGainMaxHistory = parseInt_(
      env['CHUNK_SELECTOR_INFO_GAIN_MAX_HISTORY'],
      this.config.infoGainMaxHistory
    );
    this.config.useLLMSubQuery = parseBool(
      env['CHUNK_SELECTOR_USE_LLM_SUB_QUERY'],
      this.config.useLLMSubQuery
    );
    this.config.llmSubQueryKeepTopK = parseInt_(
      env['CHUNK_SELECTOR_LLM_SUB_QUERY_KEEP_TOP_K'],
      this.config.llmSubQueryKeepTopK
    );
  }

  /**
   * 配置更新（对齐 Python ChunkSelectorConfig）
   */
  configure(options: {
    enableLLMRerank?: boolean;
    maxDocLength?: number;
    llmScoreThreshold?: number;
    enableInfoGain?: boolean;
    infoGainThreshold?: number;
    infoGainMaxHistory?: number;
    useLLMSubQuery?: boolean;
    llmSubQueryKeepTopK?: number;
    stage1Threshold?: number;
  }): void {
    Object.assign(this.config, options);
  }

  /**
   * 获取当前配置（供外部节点读取 useLLMSubQuery、llmSubQueryKeepTopK 等）
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.stage1ScoreCache.clear();
  }

  async execute(input: SkillInput): Promise<SkillOutput> {
    const {
      query,
      chunks,
      tokenBudget,
      playbook = 'general',
      enableInfoGain,
      enableLLMRerank,
      pinnedChunkIds = [],
      answerMaxChunks = 15
    } = input as unknown as ChunkSelectorOptions;

    // 获取 playbook 特定配置
    const playbookSettings = this.playbookConfig[playbook] || this.playbookConfig.general;

    // 本次调用的有效配置（不修改实例 config，避免共享实例状态污染）
    const effectiveLLMRerank = enableLLMRerank ?? this.config.enableLLMRerank;
    const effectiveInfoGain = enableInfoGain ?? this.config.enableInfoGain;

    if (!chunks || chunks.length === 0) {
      return this.success({ selectedChunks: [], totalTokens: 0, stage: 1 });
    }

    // ── 不相关门控标志（全部 chunk 各信号均低于阈值时，移除保底 fallback）──────
    // 对齐 nodes.ts isSearchIrrelevant 逻辑：优先 LLM score（跨语言/专业术语同义词场景更可靠），
    // 无 LLM score 时回退 rerankScore / vectorScore / score（向量相似度对跨语言比 cross-encoder 更鲁棒）
    const allChunksIrrelevant = chunks.every((c) => {
      if (c.llm_sub_query_score !== undefined) {
        return c.llm_sub_query_score < IRRELEVANT_LLM_THRESHOLD;
      }
      return (c.rerankScore ?? c.vectorScore ?? c.score ?? 0) < IRRELEVANT_BGE_THRESHOLD;
    });

    // 打印每个 chunk 的分数以便诊断
    chunks.slice(0, 5).forEach((c, i) => {
      this.logger?.debug(
        `  chunk[${i}] id=${c.id} vectorScore=${c.vectorScore?.toFixed(4)} llm_score=${c.llm_sub_query_score?.toFixed(4)} score=${c.score?.toFixed(4)} rerankScore=${c.rerankScore?.toFixed(4)} content="${c.content.substring(0, 60).replace(/\n/g, ' ')}"`
      );
    });
    // 全部不相关：直接返回空，不走任何保底逻辑
    if (allChunksIrrelevant) {
      this.logger?.info(
        `[ChunkSelector] allChunksIrrelevant=true (bgeThreshold=${IRRELEVANT_BGE_THRESHOLD}, llmThreshold=${IRRELEVANT_LLM_THRESHOLD}) — skipping selection, returning empty`
      );
      return this.success({ selectedChunks: [], totalTokens: 0, stage: 1 });
    }

    // ── Stage 1: Token gate（粗筛）──────────────────────────────────────
    let candidates = fitChunks(chunks, tokenBudget * 3); // 先宽松一点，后面再限制

    // ── Stage 2: LLM 精排──────────────────────────────────────────────
    let llmScoreUsed = false;
    if (effectiveLLMRerank && this.llm && playbookSettings.enableLLM && candidates.length > 0) {
      this.logger?.info(
        `[ChunkSelector] Stage2 LLM rerank: ${candidates.length} candidates (playbook=${playbook})`
      );
      candidates = await this.rerankWithLLM(query, candidates, playbook);
      llmScoreUsed = true;
    } else {
      const skipReason = !effectiveLLMRerank
        ? 'enableLLMRerank=false'
        : !this.llm
          ? 'no LLM'
          : !playbookSettings.enableLLM
            ? `playbook(${playbook}).enableLLM=false`
            : 'no candidates';
      this.logger?.info(`[ChunkSelector] Stage2 skipped (${skipReason}), sorting by cached scores`);
      // enableLLMRerank: false 时，优先使用 Stage 1 缓存分数排序
      candidates.sort((a, b) => {
        const scoreA = (a as any).llm_sub_query_score ?? a.rerankScore ?? a.score ?? 0;
        const scoreB = (b as any).llm_sub_query_score ?? b.rerankScore ?? b.score ?? 0;
        return scoreB - scoreA;
      });
    }

    // ── Stage 3: 动态扩展──────────────────────────────────────────────
    // 对于 Stage1 高分的 chunk，扩展候选池
    candidates = this.dynamicExpand(candidates, answerMaxChunks, playbookSettings.threshold);

    // ── Stage 4: 信息增益过滤（pinned chunk 跳过）──────────────────────
    let infoGainFiltered = 0;
    const pinnedSet = new Set(pinnedChunkIds);
    if (effectiveInfoGain && this.infoGainCalc && playbookSettings.enableInfoGain) {
      const beforeCount = candidates.length;
      candidates = this.filterByInfoGain(candidates, pinnedSet, this.config.infoGainThreshold);
      infoGainFiltered = beforeCount - candidates.length;
    }

    // ── pinned chunks 移至最前（确保 token 充足时优先保留）────────────
    if (pinnedChunkIds.length > 0 && pinnedSet.size > 0) {
      const pinned = candidates.filter((c) => pinnedSet.has(c.id));
      const others = candidates.filter((c) => !pinnedSet.has(c.id));
      candidates = [...pinned, ...others];
    }

    // ── 至少保留1个（全不相关时不保底，允许返回空列表）───────────────
    if (candidates.length === 0 && chunks.length > 0 && !allChunksIrrelevant) {
      candidates = [chunks[0]];
    }

    // ── Stage 5: Token budget 限制──────────────────────────────────────
    const finalChunks = fitChunks(candidates, tokenBudget);
    const totalTokens = estimateTokens(finalChunks.map((c) => c.content).join('\n'));

    return this.success({
      selectedChunks: finalChunks,
      totalTokens,
      stage: llmScoreUsed ? 2 : 1,
      llmScoreUsed,
      infoGainFiltered
    });
  }

  /**
   * Stage 2: LLM 精排（使用 BGE score 排序后调用 LLM 重评）
   * 优化：使用 Promise.all 并发调用 LLM（最多 10 并发），对齐 Python 行为
   */
  private async rerankWithLLM(
    query: string,
    chunks: ChunkItem[],
    playbook: string
  ): Promise<ChunkItem[]> {
    if (!chunks.length || !this.llm) return chunks;

    const scoreTopK = Math.min(chunks.length, 45); // answer_max_chunks * 3
    let candidates = chunks.slice(0, scoreTopK);

    // 并发评分（对齐 Python asyncio.gather + Semaphore(10)）
    const CONCURRENCY = 10;

    // Stage 1 缓存预填充（对齐 Python _llm_rerank 缓存复用逻辑）
    const llmScores: number[] = new Array(candidates.length).fill(0);
    let cachedCount = 0;
    const chunksNeedingLLM: Array<{ chunk: ChunkItem; idx: number }> = [];

    for (const [idx, chunk] of candidates.entries()) {
      const cachedScore = (chunk as any).llm_sub_query_score as number | undefined;
      const cachedPlaybook = (chunk as any).llm_sub_query_playbook as string | undefined;
      if (cachedScore !== undefined && cachedPlaybook === playbook) {
        llmScores[idx] = cachedScore;
        cachedCount++;
      } else {
        chunksNeedingLLM.push({ chunk, idx });
      }
    }

    this.logger?.info(
      `Stage2 LLM rerank: reusing ${cachedCount} cached Stage1 scores, calling LLM for ${chunksNeedingLLM.length} chunks (playbook=${playbook})`
    );

    // 分批并发执行，每批最多 CONCURRENCY 个
    for (let i = 0; i < chunksNeedingLLM.length; i += CONCURRENCY) {
      const batch = chunksNeedingLLM.slice(i, i + CONCURRENCY);
      const batchPromises = batch.map(async ({ chunk, idx }) => {
        try {
          const score = await this.scoreSingleChunkLLM(query, chunk, playbook);
          return { idx, score };
        } catch (e) {
          this.logger?.warn(`Stage2 LLM scoring failed for chunk ${idx}:`, {
            message: e instanceof Error ? e.message : String(e)
          });
          return { idx, score: 5.0 };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const { idx, score } of batchResults) {
        llmScores[idx] = score;
      }
    }

    // 合并 BGE score 和 LLM score
    // llmScore 归一化到 [0,1]，使 combinedScore 整体保持 [0,1] 范围
    const scored = candidates.map((chunk, idx) => {
      const bgeScore = chunk.rerankScore ?? chunk.score ?? 0;
      const llmScore = llmScores[idx] / 10; // 0-10 → 0-1
      // 复合分数：BGE * 0.4 + LLM * 0.6（对齐 Python _llm_rerank），范围 [0,1]
      const combinedScore = bgeScore * 0.4 + llmScore * 0.6;
      return { ...chunk, combinedScore } as ChunkItem & { combinedScore: number };
    });

    // 按复合分数排序
    scored.sort((a, b) => b.combinedScore - a.combinedScore);

    // 若所有分数均低于阈值，保留 top-5（对齐 Python 第 429-438 行 fallback）
    // Python llmScoreThreshold 基于 BGE*0.4 + LLM*0.6（LLM 原始 0-10）scale；
    // TS combinedScore 已将 LLM 归一化到 0-1，故阈值除以 10 换算
    const scoreThreshold = this.config.llmScoreThreshold / 10;
    const anyAboveThreshold = scored.some((c) => c.combinedScore >= scoreThreshold);
    if (!anyAboveThreshold && scored.length > 5) {
      this.logger?.warn(
        '[ChunkSelector] LLM rerank: all scores below threshold, keeping top-5 as fallback'
      );
      // 将 combinedScore 写入 rerankScore（供 FastGPT adapter 映射为 reRank 类型展示综合得分）
      return scored.slice(0, 5).map(
        ({ combinedScore, ...chunk }) =>
          ({
            ...chunk,
            rerankScore: combinedScore
          }) as ChunkItem
      );
    }

    // 将 combinedScore 写入 rerankScore（供 FastGPT adapter 映射为 reRank 类型展示综合得分）
    return scored.map(
      ({ combinedScore, ...chunk }) =>
        ({
          ...chunk,
          rerankScore: combinedScore
        }) as ChunkItem
    );
  }

  /**
   * 单个 LLM 评分（对齐 Python _score_chunk_with_llm）
   * 使用 playbook-aware prompt
   */
  private async scoreSingleChunkLLM(
    query: string,
    chunk: ChunkItem,
    playbook: string
  ): Promise<number> {
    // 使用 playbook-aware prompt（对齐 Python）
    const promptTemplate = getRerankPrompt(playbook);
    const docContent = chunk.content.substring(0, this.config.maxDocLength);
    const prompt = promptTemplate
      .replace('{user_query}', query)
      .replace('{question_analysis_section}', '')
      .replace('{doc_content}', docContent);

    const response = await this.llm!.chat([{ role: 'user', content: prompt }], {
      temperature: 0.1,
      maxTokens: 8
    });

    const content = response.content.trim();
    const score = parseInt(content, 10);

    if (isNaN(score) || score < 0 || score > 10) {
      this.logger?.warn(`Stage2 LLM scoring returned invalid score "${content}", using 5.0`);
      return 5.0;
    }
    return score;
  }

  /**
   * Stage 3: 动态扩展 - 根据 Stage1 高分扩展候选池
   */
  private dynamicExpand(
    chunks: ChunkItem[],
    answerMaxChunks: number,
    _threshold: number
  ): ChunkItem[] {
    const expandLimit = answerMaxChunks * this.config.stage1ExpandMultiplier;
    let expanded = chunks.slice(0, expandLimit);

    // 统计 Stage1 高分数量
    let highScoreCount = 0;
    for (const c of expanded) {
      const stage1Score = (c as unknown as { llm_sub_query_score?: number }).llm_sub_query_score;
      if (stage1Score !== undefined && stage1Score >= this.config.stage1HighScoreThreshold) {
        highScoreCount++;
      }
    }

    // 如果有 Stage1 高分，保持扩展
    if (highScoreCount > 0) {
      return expanded;
    }

    // 否则，收缩到正常范围
    return chunks.slice(0, answerMaxChunks);
  }

  /**
   * Stage 4: 信息增益过滤（对齐 Python _filter_by_info_gain）
   *
   * 策略：
   * 1. pinned chunk 始终保留（@assess 标注）
   * 2. 前 5 个默认通过（高相关 = 高增益假设）
   * 3. 超过 5 后计算信息增益，低于阈值跳过
   * 4. Stage 1 高分（>=7.0）的 chunk 降低阈值 50%
   * 5. 至少保留 3 个（防止过度过滤）
   */
  private filterByInfoGain(
    chunks: ChunkItem[],
    pinnedIds: Set<string>,
    threshold: number = 0.1
  ): ChunkItem[] {
    if (!this.infoGainCalc) return chunks;
    if (chunks.length === 0) return [];

    const SKIP_FRONT = 5;
    const STAGE1_HIGH_SCORE_THRESHOLD = 7.0;
    const MIN_KEEP = 3;

    const calc = new InformationGainCalculator(10);
    const selected: ChunkItem[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // pinned chunk 始终保留
      if (pinnedIds.has(chunk.id)) {
        selected.push(chunk);
        calc.addSelected(chunk);
        continue;
      }

      // 前 K 个默认通过
      if (i < SKIP_FRONT) {
        selected.push(chunk);
        calc.addSelected(chunk);
        continue;
      }

      const infoGain = calc.computeInfoGain(chunk);
      const stage1Score = (chunk as unknown as { llm_sub_query_score?: number })
        .llm_sub_query_score;

      if (stage1Score !== undefined && stage1Score >= STAGE1_HIGH_SCORE_THRESHOLD) {
        // Stage 1 高分 → 降低阈值 50%
        const effectiveThreshold = threshold * 0.5;
        if (infoGain >= effectiveThreshold) {
          selected.push(chunk);
          calc.addSelected(chunk);
        }
        continue;
      }

      // 标准信息增益判断
      if (infoGain >= threshold) {
        selected.push(chunk);
        calc.addSelected(chunk);
      }
    }

    // 确保至少保留 MIN_KEEP 个
    if (selected.length < MIN_KEEP && chunks.length >= MIN_KEEP) {
      const selectedIds = new Set(selected.map((c) => c.id));
      for (const chunk of chunks) {
        if (!selectedIds.has(chunk.id)) {
          selected.push(chunk);
          if (selected.length >= MIN_KEEP) break;
        }
      }
    }

    return selected;
  }

  /**
   * 重置信息增益计算器
   */
  reset(): void {
    this.infoGainCalc?.reset();
  }

  /**
   * 添加选中 chunk 到历史
   */
  addToHistory(chunk: ChunkItem): void {
    this.infoGainCalc?.addSelected(chunk);
  }

  /**
   * Playbook 感知 dispatch
   */
  getPlaybookConfig(playbook: string): {
    enableLLM: boolean;
    enableInfoGain: boolean;
    threshold: number;
  } {
    return this.playbookConfig[playbook] || this.playbookConfig.general;
  }
}

// ============================================================
// Stage 1 Sub-query Filter（对齐 Python sub_query_filter()）
// ============================================================

/**
 * Stage 1 sub-query LLM filter
 * - 独立 LLM 评分（非 BGE+LLM 混合），评分仅对 sub_query 有效
 * - 评分缓存到 chunk.llm_sub_query_score（不覆盖 BGE score）
 * - 返回 topK 个高分 chunk（用于后续 chunk_selector Stage 2）
 *
 * @param chunks - 待过滤 chunks
 * @param userQuery - 用户原始问题（上下文）
 * @param subQuery - 当前子查询
 * @param questionAnalysis - 问题分析文本（用于 {question_analysis_section}）
 * @param llm - LLM provider
 * @param keepTopK - 保留 top-K 个（默认 10）
 * @param playbookName - playbook 名
 * @param maxDocLength - 截断长度（默认 2000）
 */
export async function subQueryFilter(
  chunks: ChunkItem[],
  userQuery: string,
  subQuery: string,
  questionAnalysis: string,
  llm: LLMProvider,
  keepTopK: number = 10,
  playbookName: string = '',
  maxDocLength: number = 2000
): Promise<ChunkItem[]> {
  if (chunks.length === 0) return chunks;
  if (!STAGE1_ENABLED_PLAYBOOKS.has(playbookName)) return chunks;

  // 构建 {question_analysis_section}
  const analysisSection = questionAnalysis ? `\n\nQuestion Analysis:\n${questionAnalysis}` : '';

  // 并发限制：每批最多 10 个
  const CONCURRENCY = 10;
  const scored: Array<ChunkItem & { _stage1Score: number }> = [];

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);

    // 并发评分
    const batchScores = await Promise.all(
      batch.map(async (chunk) => {
        // 如果已有同 playbook 的缓存分数则复用
        const cachedChunk = chunk as ChunkItem & {
          llm_sub_query_score?: number;
          llm_sub_query_playbook?: string;
        };
        if (
          cachedChunk.llm_sub_query_score !== undefined &&
          cachedChunk.llm_sub_query_playbook === playbookName
        ) {
          return cachedChunk.llm_sub_query_score;
        }

        const docContent = chunk.content.substring(0, maxDocLength);
        const prompt = RERANKER_SUB_QUERY_PROMPT.replace('{user_query}', userQuery)
          .replace('{question_analysis_section}', analysisSection)
          .replace('{sub_query_text}', subQuery)
          .replace('{doc_content}', docContent);

        try {
          const response = await llm.chat([{ role: 'user', content: prompt }], {
            temperature: 0.0,
            maxTokens: 8
          });
          const raw = response.content.trim();
          const score = parseInt(raw, 10);
          if (isNaN(score)) {
            getLogger()?.debug(
              `[subQueryFilter] LLM returned non-numeric: raw="${raw.substring(0, 100)}" chunkId=${chunk.id} → fallback to 5`
            );
          }
          return isNaN(score) ? 5 : Math.max(0, Math.min(10, score));
        } catch (e) {
          getLogger()?.warn('[subQueryFilter] LLM scoring failed for chunk:', {
            chunkId: chunk.id,
            message: e instanceof Error ? e.message : String(e)
          });
          return 5; // 失败返回中间值
        }
      })
    );

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const score = batchScores[j];

      // 缓存分数（不覆盖 BGE score）
      (
        chunk as ChunkItem & {
          llm_sub_query_score: number;
          llm_sub_query_playbook: string;
        }
      ).llm_sub_query_score = score;
      (
        chunk as ChunkItem & {
          llm_sub_query_score: number;
          llm_sub_query_playbook: string;
        }
      ).llm_sub_query_playbook = playbookName;

      scored.push({ ...chunk, _stage1Score: score });
    }
  }

  // 按 Stage1 分数降序排列，取 topK；截断 LLM 给 0 分的 chunk（完全无关），弱相关（1-2 分）留给 isSearchIrrelevant 整批判断
  scored.sort((a, b) => b._stage1Score - a._stage1Score);
  const topK = scored.filter((c) => c._stage1Score > 0).slice(0, keepTopK);

  // 返回时去掉临时字段 _stage1Score
  return topK.map(({ _stage1Score, ...chunk }) => chunk as ChunkItem);
}
