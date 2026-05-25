// src/agent/context.ts
// RequestContext - 完整 Blackboard 模式（对齐 Python context.py）
//
// Blackboard 模式：每个请求一个 ctx 实例，tools 通过闭包访问
// 包含：Blackboard 数据 + Skills 闭包 + 流式事件
// 混合机制：直接修改 ctx，通过 toStateUpdate() 同步到 LangGraph state

import type { ChunkItem } from '../types/chunk';
import type { LLMMessage } from '../types/message';
import type { AgenticSearchConfig, AgenticSearchProviders } from '../ports/agentic';
import type { Logger } from '../ports/logger';
import type { SearchSkill, AnswerSkill, QueryRewriteSkill } from '../skills/expertise/index';
import type { RerankSkill, ChunkSelectorSkill } from '../skills/atomic/index';
import type { AgenticRAGStateType } from '../types/state';
import { DEFAULT_SEARCH_CONFIG } from '../utils/constants';
import { createSkills as createSkillBundle } from './graph';
import type { LanguageTracker } from '../utils/lang_directive';

// ============================================================
// 类型定义
// ============================================================

export interface PlanStep {
  step: number;
  strategy: string;
  queries: string[];
  parallel?: boolean;
  depends_on?: number | null;
  note?: string;
  executed?: boolean;
  failed?: boolean;
}

export interface AnswerResult {
  answer: string;
  citedIds: string[];
  confidence: number;
  reflectionLabel?: string;
  reflectionReason?: string;
}

/**
 * Agent Event - 流式事件
 */
export interface AgentEvent {
  step: string;
  detail?: string;
  reason?: string;
  playbook?: string;
  timestamp: number;
  extra?: Record<string, unknown>;
}

// ============================================================
// RequestContext - 完整 Blackboard
// ============================================================

/** 单轮 dataset 信号 */
interface DatasetRoundSignal {
  round: number;
  searchCount: number;
  survivedCount: number;
  totalScore: number;
}

type DatasetStatus = 'active' | 'excluded' | 'probe_pending' | 'low_priority';

/** 跨轮聚合 signal */
interface DatasetAggregateSignal {
  status: DatasetStatus;
  history: DatasetRoundSignal[];
  excludedAtRound?: number;
}

export class RequestContext {
  // ─── 配置 ─────────────────────────────────────────────
  config: Required<AgenticSearchConfig>;

  // ─── 输入 ─────────────────────────────────────────────
  question: string = '';
  datasetIds: string[] = [];
  chatHistory: LLMMessage[] = [];
  priorContext: string = '';

  // ─── Blackboard: 检索结果 ─────────────────────────────
  allChunks: ChunkItem[] = [];
  searchQueries: string[] = [];
  searchCount: number = 0;
  // 最近一次搜索与已累积 chunks 的重叠率（0.0=全部新，1.0=全部重复）
  lastSearchOverlap: number = 0;
  // 最近一次搜索返回的 chunks（用于信息增益计算）
  lastSearchChunks: ChunkItem[] = [];

  // 连续不相关搜索次数（不相关 +1，相关重置为 0；达阈值触发早停）
  consecutiveIrrelevantSearches: number = 0;

  // ─── 渐进式信息收集 ───────────────────────────────────
  // 已确认收集到的有价值信息（累积追加，程序去重完全相同的条目）
  findings: string[] = [];
  // 当前仍缺少的信息（每次 @assess 覆盖，代表最新快照）
  lacks: string[] = [];
  // chunk 标注：chunk_id → key_info (None=整个 chunk 有用，string=部分有用)
  keyChunkAnnotations: Map<string, string | null> = new Map();

  // ─── 改写子查询追踪 ─────────────────────────────────
  rewriteQueries: string[] = [];

  // ─── 对比分析追踪（comparative_analysis playbook）─────
  // 对比对象列表，如 ["vaf", "vad", "vac", "vm"]
  compareObjects: string[] = [];
  // 自动发现的对比维度，如 ["定义", "功能", "适用场景", "架构"]
  discoveredDimensions: string[] = [];
  // 每个维度的搜索覆盖状态: {维度名: {"searched": bool, "saturated": bool}}
  dimensionCoverage: Map<string, { searched: boolean; saturated: boolean }> = new Map();
  // 对比阶段: "discovery" (探索对象/维度) -> "enrichment" (深度搜索) -> "done"
  comparePhase: 'discovery' | 'enrichment' | 'done' = 'discovery';
  // 连续低信息增益次数（用于早停判断）
  consecutiveLowGainCount: number = 0;

  // ─── 执行计划 ───────────────────────────────────────
  pendingPlan: PlanStep[] = [];

  // ─── Answer 结果暂存 ────────────────────────────────
  lastAnswer: AnswerResult | null = null;
  answerGenerated: boolean = false; // @summary tool 成功完成后设为 true

  // ─── 流事件缓冲 ─────────────────────────────────────
  pendingEvents: AgentEvent[] = [];
  // 异步队列，用于实时流式推送
  streamQueue: AsyncIterableIterator<AgentEvent> | null = null;

  // ─── Skills（__post_init__ 初始化）──────────────────
  searchSkill!: SearchSkill;
  answerSkill!: AnswerSkill;
  rewriteSkill!: QueryRewriteSkill;
  rerankSkill!: RerankSkill;
  chunkSelectorSkill!: ChunkSelectorSkill;

  // ─── LanguageTracker（sync_blackboard 初始化）────────
  languageTracker?: LanguageTracker;

  // ─── 语言异常压制早停（LanguageTracker 写入，simpleQuerySearchCapped 读取）
  suppressEarlyStop: boolean = false;

  // ─── 多 dataset 跨轮信号追踪 ───────────────────────────
  // 默认禁用，通过 AGENTIC_ENABLE_DATASET_PRUNING=true 开启
  datasetSignalMap: Map<string, DatasetAggregateSignal> = new Map();
  lastSearchQueries: string[] = [];
  signalRound: number = 0;
  datasetPruningEnabled: boolean =
    (process.env.AGENTIC_ENABLE_DATASET_PRUNING ?? 'false').toLowerCase() === 'true';

  private static readonly ACTIVE_THRESHOLD = 4.0;
  private static readonly EXCLUDE_THRESHOLD = 3.0;
  private static readonly JACCARD_CHANGE = 0.5;

  // ─── 首次 LLM 调用分析结果 ─────────────────────────
  analysis: string = '';

  // ─── Playbook 选择结果 ─────────────────────────────
  playbook: string = ''; // 活跃的 playbook 名称

  // ─── 用户原始问题（用于 answer final rerank）───────
  originalQuestion: string = '';

  // ─── Chat history 结构化信息（用于追问）────────────
  previousTopics: string[] = [];
  previousPlaybooks: string[] = [];
  chatEntities: string[] = [];

  // ─── 可观测性 ───────────────────────────────────────
  executionPath: string[] = [];
  toolCallCount: number = 0;
  toolResultRound: number = 0; // tools 节点轮次计数，用于 tool result 消息 id

  // ─── Logger ───────────────────────────────────────
  logger?: Logger;
  private _defaultLoggerCreated = false;
  private _defaultLogger?: Logger;

  // ─── 构造 ───────────────────────────────────────────

  /**
   * 创建 RequestContext
   * @param config 配置
   * @param datasetIds 数据集 ID 列表
   * @param providers LLM 和其他 provider（用于初始化 skills）
   */
  constructor(
    config: AgenticSearchConfig = {},
    datasetIds: string[] = [],
    providers?: AgenticSearchProviders,
    logger?: Logger
  ) {
    this.config = {
      searchMode: config.searchMode ?? DEFAULT_SEARCH_CONFIG.SEARCH_MODE,
      maxSearchRounds: config.maxSearchRounds ?? DEFAULT_SEARCH_CONFIG.MAX_SEARCH_ROUNDS,
      maxToolCalls: config.maxToolCalls ?? DEFAULT_SEARCH_CONFIG.MAX_TOOL_CALLS,
      maxSearchCalls: config.maxSearchCalls ?? 5,
      maxIterations: config.maxIterations ?? 20,
      tokenBudget: config.tokenBudget ?? 12000,
      embeddingWeight: config.embeddingWeight ?? DEFAULT_SEARCH_CONFIG.EMBEDDING_WEIGHT,
      similarity: config.similarity ?? DEFAULT_SEARCH_CONFIG.SIMILARITY_THRESHOLD,
      rerankTopK: config.rerankTopK ?? DEFAULT_SEARCH_CONFIG.RERANK_TOP_K,
      retrieveLimit: config.retrieveLimit ?? DEFAULT_SEARCH_CONFIG.RETRIEVE_LIMIT,
      answerMaxChunks: config.answerMaxChunks ?? DEFAULT_SEARCH_CONFIG.ANSWER_MAX_CHUNKS,
      answerMaxTokens: config.answerMaxTokens ?? DEFAULT_SEARCH_CONFIG.ANSWER_MAX_TOKENS,
      enableShowReferences: config.enableShowReferences ?? true,
      enableInfoGain: config.enableInfoGain ?? true,
      infoGainThreshold: config.infoGainThreshold ?? 0.1,
      infoGainMaxHistory: config.infoGainMaxHistory ?? 10,
      searchOnly: config.searchOnly ?? false,
      forbidCollectionIds: config.forbidCollectionIds ?? []
    };
    this.datasetIds = datasetIds;
    this.logger = logger;

    // 如果提供了 providers，初始化 skills
    if (providers) {
      this.initializeSkills(providers);
    }
  }

  /**
   * 初始化 Skill 实例（在 __post_init__ 中调用）
   */
  initializeSkills(providers: AgenticSearchProviders): void {
    const skills = createSkillBundle(providers);
    this.searchSkill = skills.searchSkill;
    this.answerSkill = skills.answerSkill;
    this.rewriteSkill = skills.rewriteSkill;
    this.rerankSkill = skills.rerankSkill;
    this.chunkSelectorSkill = skills.chunkSelectorSkill;

    // 如果 providers 中有 logger，使用它
    if (providers.logger && !this.logger) {
      this.logger = providers.logger;
    }
  }

  /**
   * 获取 Logger（懒创建默认 logger）
   */
  getLogger(): Logger {
    if (this.logger) return this.logger;
    if (this._defaultLoggerCreated && this._defaultLogger) return this._defaultLogger;

    // 懒创建默认 logger
    const { createLogger } = require('../ports/logger');
    const defaultLogger = createLogger({ prefix: 'AgenticRAG' });
    this._defaultLogger = defaultLogger;
    this._defaultLoggerCreated = true;
    return defaultLogger;
  }

  // ─── Blackboard 方法 ────────────────────────────────

  /**
   * 去重添加 chunks 到 Blackboard
   */
  addChunks(newChunks: ChunkItem[]): void {
    const existing = new Set(this.allChunks.map((c) => c.id));
    for (const chunk of newChunks) {
      if (!existing.has(chunk.id)) {
        this.allChunks.push(chunk);
        existing.add(chunk.id);
      }
    }
  }

  /**
   * 智能添加 chunks：去重 + 分数更新
   */
  addChunksSmart(newChunks: ChunkItem[]): number {
    let addedCount = 0;
    const existing: Map<string, number> = new Map();
    for (let i = 0; i < this.allChunks.length; i++) {
      existing.set(this.allChunks[i].id, i);
    }

    for (const chunk of newChunks) {
      const cid = chunk.id;
      if (existing.has(cid)) {
        // 已存在：更新分数
        const idx = existing.get(cid)!;
        const old = this.allChunks[idx];
        if ((chunk.score ?? 0) > (old.score ?? 0)) {
          this.allChunks[idx] = { ...old, score: chunk.score };
        }
      } else {
        // 新增
        this.allChunks.push(chunk);
        existing.set(cid, this.allChunks.length - 1);
        addedCount++;
      }
    }

    return addedCount;
  }

  /**
   * 记录语义过程事件
   * @param step 事件类型（如 "searching", "thinking"）
   * @param detail 人类可读描述
   * @param internal 如果为 true，只记录到 pending_events（调试用），不推送到 streamQueue
   * @param extra 额外事件数据
   */
  emit(
    step: string,
    detail?: string,
    extra?: Record<string, unknown>,
    internal: boolean = false
  ): void {
    const event: AgentEvent = {
      step,
      detail,
      timestamp: Date.now(),
      extra
    };
    this.pendingEvents.push(event);

    // 如果有流迭代器，推送事件
    if (!internal && this.streamQueue) {
      // 注意：AsyncIterable 无法直接推送，这里用 pendingEvents 缓冲
      // 调用方通过 drainEvents 获取事件
    }
  }

  /**
   * 取出所有待处理事件并清空缓冲
   */
  drainEvents(): AgentEvent[] {
    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    return events;
  }

  // ─── 混合机制：ctx ↔ state 同步 ───────────────────────

  /**
   * 将 ctx 状态同步到 LangGraph state（对齐 Python sync_blackboard）
   * 在 tools 节点执行后调用，将 ctx 的变更同步到 state
   */
  toStateUpdate(): Partial<AgenticRAGStateType> {
    const updates: Partial<AgenticRAGStateType> = {
      allChunks: [...this.allChunks],
      searchQueries: [...this.searchQueries],
      searchCount: this.searchCount,
      executionPath: ['sync_blackboard']
    };

    // 如果有 answer，同步 answer 相关字段
    if (this.lastAnswer) {
      const ans = this.lastAnswer;
      updates.answer = ans.answer;
      updates.citedIds = ans.citedIds;
      updates.confidence = ans.confidence;
      updates.reflectionLabel = ans.reflectionLabel || '';
      updates.reflectionReason = ans.reflectionReason || '';
      updates.refuse = ans.reflectionLabel === 'refuse';
      // 清空 last_answer（避免重复同步）
      this.lastAnswer = null;
    }

    return updates;
  }

  /**
   * 从 LangGraph state 恢复 ctx（初始化时调用）
   * 对应 Python 中从 state 读取初始值到 ctx
   */
  // ─── 信号辅助方法 ─────────────────────────────────

  private getAvgScore(dsId: string): number {
    const sig = this.datasetSignalMap.get(dsId);
    if (!sig || sig.history.length === 0) return 0;
    const last = sig.history[sig.history.length - 1];
    return last.survivedCount > 0 ? last.totalScore / last.survivedCount : 0;
  }

  private getDelta(dsId: string): number {
    const sig = this.datasetSignalMap.get(dsId);
    if (!sig || sig.history.length < 2) return 0;
    const [prev, last] = [sig.history[0], sig.history[1]];
    const prevAvg = prev.survivedCount > 0 ? prev.totalScore / prev.survivedCount : 0;
    const lastAvg = last.survivedCount > 0 ? last.totalScore / last.survivedCount : 0;
    return lastAvg - prevAvg;
  }

  /** 检测本轮 searchQueries 是否相比上轮有显著变化（Jaccard < 0.5） */
  private hasQueryChanged(currentQueries: string[]): boolean {
    if (this.lastSearchQueries.length === 0) return false;
    const prev = new Set(this.lastSearchQueries.map((q) => q.toLowerCase()));
    const curr = new Set(currentQueries.map((q) => q.toLowerCase()));
    const intersection = new Set([...prev].filter((q) => curr.has(q)));
    const union = new Set([...prev, ...curr]);
    const jaccard = union.size === 0 ? 1 : intersection.size / union.size;
    return jaccard < RequestContext.JACCARD_CHANGE;
  }

  /** 全局低信号检查：所有 dataset 中 best avgScore < EXCLUDE_THRESHOLD → 不触发排除 */
  private isGlobalLowSignal(): boolean {
    let bestAvg = 0;
    for (const dsId of this.datasetSignalMap.keys()) {
      const avg = this.getAvgScore(dsId);
      if (avg > bestAvg) bestAvg = avg;
    }
    return bestAvg < RequestContext.EXCLUDE_THRESHOLD;
  }

  static fromState(state: Partial<AgenticRAGStateType>): RequestContext {
    const ctx = new RequestContext();
    ctx.allChunks = state.allChunks || [];
    ctx.searchQueries = state.searchQueries || [];
    ctx.searchCount = state.searchCount || 0;
    ctx.question = state.question || '';
    ctx.datasetIds = state.datasetIds || [];
    ctx.chatHistory = state.chatHistory || [];
    ctx.playbook = state.playbook || 'general';
    ctx.analysis = state.analysis || '';
    return ctx;
  }

  // ─── 多 dataset 动态信号追踪 ───────────────────────────

  /**
   * 记录一轮搜索中每个 dataset 返回的 chunk 数。
   * 调用时机：@search 返回后、sub_query filter 前。
   */
  recordDatasetSearch(chunks: ChunkItem[]): void {
    if (!this.datasetPruningEnabled) return;
    const perDataset = new Map<string, number>();
    for (const c of chunks) {
      perDataset.set(c.datasetId, (perDataset.get(c.datasetId) || 0) + 1);
    }
    for (const [dsId, count] of perDataset) {
      let sig = this.datasetSignalMap.get(dsId);
      if (!sig) {
        sig = { status: 'active', history: [] };
        this.datasetSignalMap.set(dsId, sig);
      }
      sig.history.push({
        round: this.signalRound,
        searchCount: count,
        survivedCount: 0,
        totalScore: 0
      });
      if (sig.history.length > 2) sig.history = sig.history.slice(-2);
    }
  }

  /**
   * 记录 sub_query filter 后每个 dataset 存活了多少 chunk。
   * 调用时机：sub_query filter 后。
   */
  recordDatasetSurvival(survivedChunks: ChunkItem[]): void {
    if (!this.datasetPruningEnabled) return;
    const perDataset = new Map<string, { count: number; totalScore: number }>();
    for (const c of survivedChunks) {
      const cur = perDataset.get(c.datasetId) || { count: 0, totalScore: 0 };
      cur.count++;
      const chunkScore = (c as any).llm_sub_query_score ?? (c.rerankScore ?? c.score ?? 0) * 10;
      cur.totalScore += chunkScore;
      perDataset.set(c.datasetId, cur);
    }
    for (const [dsId, { count, totalScore }] of perDataset) {
      const sig = this.datasetSignalMap.get(dsId);
      if (!sig || sig.history.length === 0) continue;
      const last = sig.history[sig.history.length - 1];
      last.survivedCount = count;
      last.totalScore = totalScore;
    }
  }

  /** 聚合本轮信号，执行决策矩阵（每轮 @search 后调用一次） */
  consolidateSignals(searchQueries: string[]): void {
    if (!this.datasetPruningEnabled) return;
    this.signalRound++;

    if (this.isGlobalLowSignal()) return;

    const allDsIds = Array.from(this.datasetSignalMap.keys());
    let excludeCount = 0;
    const maxExclude = Math.floor(allDsIds.length * 0.3);

    for (const dsId of allDsIds) {
      const sig = this.datasetSignalMap.get(dsId)!;
      if (sig.status === 'excluded' || sig.status === 'probe_pending') continue;

      const avg = this.getAvgScore(dsId);
      const delta = this.getDelta(dsId);
      const queryChanged = this.hasQueryChanged(searchQueries);

      // A-真不相关：连续 2 轮低分 + sub_query 已变化
      if (avg < RequestContext.EXCLUDE_THRESHOLD && queryChanged && sig.history.length >= 2) {
        const prevAvg =
          sig.history[0].survivedCount > 0
            ? sig.history[0].totalScore / sig.history[0].survivedCount
            : 0;
        if (prevAvg < RequestContext.EXCLUDE_THRESHOLD) {
          const activeCount = allDsIds.filter((id) => {
            const s = this.datasetSignalMap.get(id);
            return s && s.status === 'active';
          }).length;
          if (activeCount > 2 && excludeCount < maxExclude) {
            sig.status = 'excluded';
            sig.excludedAtRound = this.signalRound;
            excludeCount++;
          }
          continue;
        }
      }

      // D-衰减：高分但趋势下降 → 低优先级
      if (avg >= RequestContext.ACTIVE_THRESHOLD && delta < -2) {
        sig.status = 'low_priority';
        continue;
      }

      // C-假阴性恢复：上轮低分，本轮恢复
      if (avg >= RequestContext.ACTIVE_THRESHOLD && sig.status === 'low_priority') {
        sig.status = 'active';
      }
    }

    // probe_pending → 一轮探测后决策
    for (const dsId of allDsIds) {
      const sig = this.datasetSignalMap.get(dsId)!;
      if (sig.status !== 'probe_pending') continue;
      sig.status =
        this.getAvgScore(dsId) >= RequestContext.ACTIVE_THRESHOLD ? 'active' : 'excluded';
      if (sig.status === 'excluded') sig.excludedAtRound = this.signalRound;
    }

    this.lastSearchQueries = [...searchQueries];
  }

  /**
   * 返回下一轮搜索应使用的 dataset ID 列表。
   */
  getActiveDatasetIds(allDatasetIds: string[]): string[] {
    if (!this.datasetPruningEnabled) return allDatasetIds;
    if (this.signalRound === 0 || this.isGlobalLowSignal()) return allDatasetIds;

    return allDatasetIds.filter((dsId) => {
      const sig = this.datasetSignalMap.get(dsId);
      if (!sig) return true;
      return sig.status !== 'excluded';
    });
  }

  /**
   * query_rewrite 后调用：标记 excluded → probe_pending（非 wipe）。
   * 给被排除 dataset 一次重新探测的机会。
   */
  probeDatasetSignals(): void {
    if (!this.datasetPruningEnabled) return;
    for (const [, sig] of this.datasetSignalMap) {
      if (sig.status === 'excluded') sig.status = 'probe_pending';
    }
  }
}

// ============================================================
// 工厂函数：创建带闭包的 Tools
// ============================================================

/**
 * 创建 Tools 工厂（对齐 Python create_tools）
 * 返回的 tools 通过闭包访问同一个 RequestContext 实例
 */
export function createRequestContextTools(ctx: RequestContext) {
  // 这里返回的 tools 可以在 nodes.ts 中使用
  // 通过闭包，每个 tool 都能访问 ctx 的所有状态
  return ctx;
}
