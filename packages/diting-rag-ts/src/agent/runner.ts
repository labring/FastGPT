// src/agent/runner.ts
// Agentic Search Runner - 对齐 Python runner.py
// 职责：把图 (CompiledStateGraph) 包装为外部可用的 invoke / stream 接口

import { setMaxListeners } from 'events';

// LangGraph 并行执行多个工具节点时，每个并发 HTTP 请求都会给 combineAbortSignals
// 内部新建的 AbortController.signal 注册 abort listener，超过默认上限 10 会触发警告。
// 该 signal 随每次 invoke 结束销毁，不存在泄漏风险，是已知的 Node.js false positive
// (参见 https://github.com/nodejs/node/issues/55328)，故在模块级全局取消上限。
setMaxListeners(0);

import type { AgenticSearchProviders, AgenticSearchConfig } from '../ports/agentic';
import { wrapProviderWithDefaults } from '../ports/llm';
import type { ChunkItem } from '../types/chunk';
import type { LLMMessage } from '../types/message';
import { type AgentEvent } from './context';
import {
  buildGraph,
  buildRequiredConfig,
  calculateRecursionLimit,
  type AgenticRAGStateType,
  type GraphMode
} from './graph';
import { detectLang } from '../utils/lang';
import { setGlobalLogger } from '../utils/logger';

// ============================================================
// 公共结果类型
// ============================================================

export interface AgenticSearchResult {
  chunks: ChunkItem[];
  reasoningText: string;
  searchQueries: string[];
  searchCount: number;
  toolCallCount: number;
  playbook: string;
  executionPath: string[];
  embeddingTokens: number;
  rerankInputTokens: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  analysis?: string;
  answer?: string;
  confidence?: number;
  ttftMs?: number;
  citedIds?: string[];
  reflectionLabel?: string;
  reflectionReason?: string;
  refuse?: boolean;
  nodeHist?: unknown[];
  queryLanguage?: string;
}

export interface CreateAgenticSearchOptions {
  providers: AgenticSearchProviders;
  config?: AgenticSearchConfig;
  mode?: GraphMode;
  logger?: import('../ports/logger').Logger;
}

// ============================================================
// 流式事件常量（公共 API，供 UI / 上层消费）
// ============================================================
export const AGENT_EVENTS = {
  THINKING: 'thinking',
  SEARCHING: 'searching',
  SEARCH_DONE: 'search_done',
  REWRITING: 'rewriting',
  REWRITE_DONE: 'rewrite_done',
  GENERATING: 'generating',
  ANSWER_DELTA: 'answer_delta',
  REFLECTING: 'reflecting',
  REFLECT_DONE: 'reflect_done',
  REGENERATING: 'regenerating',
  ANSWER_DONE: 'answer_done',
  FINAL: 'final',
  ERROR: 'error',
  STARTED: 'started',
  // 补充对齐 Python 的事件类型
  REFERENCES: 'references',
  RESPONDING: 'responding',
  PLAYBOOK_SELECTED: 'playbook_selected',
  CITATION_FIX: 'citation_fix',
  ANSWER_REPLACE: 'answer_replace'
} as const;

// ============================================================
// 辅助：从 LangGraph stream chunk 生成 AgentEvent
// ============================================================

/**
 * LangGraph stream（默认 "updates" 模式）每次 yield:
 *   { [nodeName]: nodeOutput }
 * 根据节点名与输出内容映射为 AgentEvent。
 */
function mapNodeUpdateToEvent(
  nodeName: string,
  nodeOutput: Partial<AgenticRAGStateType>
): AgentEvent[] {
  switch (nodeName) {
    case 'route_playbook':
      return [{
        step: AGENT_EVENTS.PLAYBOOK_SELECTED,
        detail: `Playbook selected: ${nodeOutput.playbook ?? 'general'}`,
        playbook: nodeOutput.playbook ?? 'general',
        extra: { analysis: nodeOutput.analysis ?? '' },
        timestamp: Date.now()
      }];

    case 'agent':
    case 'native_agent':
    case 'text_agent':
    case 'auto_agent': {
      const pendingToolCalls = nodeOutput.pendingToolCalls ?? [];
      const toolNames = pendingToolCalls.map((tc) => tc.function.name);
      if (toolNames.length === 0) {
        return [];
      }
      // 注意：search 的 SEARCHING 事件由 tools 节点在执行时发射，
      // 避免 shouldContinue 早停时用户看到未实际执行的搜索文本
      if (toolNames.includes('query_rewrite')) {
        return [{
          step: AGENT_EVENTS.REWRITING,
          detail: 'Rewriting query',
          timestamp: Date.now()
        }];
      }
      if (toolNames.includes('summary')) {
        return [{
          step: AGENT_EVENTS.GENERATING,
          detail: 'Generating answer',
          timestamp: Date.now()
        }];
      }
      // 未识别的 tool call（如 assess 等内部决策工具），不产生用户可见事件
      return [];
    }

    case 'tools': {
      const path = nodeOutput.executionPath ?? [];
      const lastPath = path[path.length - 1] ?? '';
      if (lastPath.includes('search')) {
        const usedQueries = nodeOutput.searchQueries ?? [];
        const searchDoneEvent: AgentEvent = {
          step: AGENT_EVENTS.SEARCH_DONE,
          detail: `Found ${nodeOutput.allChunks?.length ?? 0} chunks`,
          timestamp: Date.now(),
          extra: {
            chunkCount: nodeOutput.allChunks?.length ?? 0,
            queries: usedQueries
          }
        };
        // 有实际查询词时才发射 SEARCHING（避免空查询产生无意义文本）
        if (usedQueries.length > 0) {
          const searchingEvent: AgentEvent = {
            step: AGENT_EVENTS.SEARCHING,
            detail: usedQueries.join(', ') || 'Searching...',
            timestamp: Date.now(),
            extra: { queries: usedQueries }
          };
          return [searchingEvent, searchDoneEvent];
        }
        return [searchDoneEvent];
      }
      if (lastPath.includes('query_rewrite')) {
        return [{
          step: AGENT_EVENTS.REWRITE_DONE,
          detail: `Rewritten to ${nodeOutput.rewriteQueries?.length ?? 0} queries`,
          timestamp: Date.now(),
          extra: { queries: nodeOutput.rewriteQueries ?? [] }
        }];
      }
      if (lastPath.includes('summary') || nodeOutput.answer) {
        return [{
          step: AGENT_EVENTS.ANSWER_DONE,
          detail: `Answer generated (confidence: ${nodeOutput.confidence ?? 0})`,
          timestamp: Date.now(),
          extra: { confidence: nodeOutput.confidence }
        }];
      }
      return [];
    }

    default:
      return [];
  }
}

/**
 * 将最终状态映射为 AgenticSearchResult
 */
function mapStateToResult(finalState: AgenticRAGStateType): AgenticSearchResult {
  // reasoningText 在流式调用中由上层（agenticSearch.ts）通过事件流累积生成；
  // mapStateToResult 仅作为 invoke 模式的同步结果，此处留空避免暴露无意义的内部路径标签。
  const reasoningText = '';

  // searchOnly 模式下用 chunk selector 的结果，否则用全部累积 chunks
  // 注意：selectedChunks 默认值为 []，需通过 executionPath 判断 select_chunks 是否实际运行过
  // 若 select_chunks 运行过（含 allChunksIrrelevant 返回 [] 的情况），使用其结果（可能是空数组）
  const executionPath = finalState.executionPath ?? [];
  const selectChunksRan = executionPath.some((p) => p.startsWith('select_chunks'));
  const chunks = selectChunksRan
    ? finalState.selectedChunks ?? []
    : (finalState.selectedChunks?.length ?? 0) > 0
      ? finalState.selectedChunks!
      : finalState.allChunks ?? [];

  return {
    chunks,
    reasoningText,
    searchQueries: finalState.searchQueries ?? [],
    searchCount: finalState.searchCount ?? 0,
    toolCallCount: finalState.toolCallCount ?? 0,
    playbook: finalState.playbook ?? 'general',
    executionPath: finalState.executionPath ?? [],
    embeddingTokens: finalState.embeddingTokens ?? 0,
    rerankInputTokens: finalState.rerankInputTokens ?? 0,
    llmInputTokens: finalState.llmInputTokens ?? 0,
    llmOutputTokens: finalState.llmOutputTokens ?? 0,
    analysis: finalState.analysis || undefined,
    answer: finalState.answer || undefined,
    confidence: finalState.confidence || undefined,
    ttftMs: finalState.ttftMs,
    citedIds: finalState.citedIds ?? [],
    reflectionLabel: finalState.reflectionLabel || undefined,
    reflectionReason: finalState.reflectionReason || undefined,
    refuse: finalState.refuse,
    nodeHist: finalState.nodeHist ?? [],
    queryLanguage: finalState.question ? detectLang(finalState.question) : undefined
  };
}

// ============================================================
// 公共工厂函数
// ============================================================

/**
 * 创建 Agentic Search 实例
 *
 * 返回 { invoke, stream } 两个接口：
 * - invoke：同步调用，返回最终结果
 * - stream：流式调用，产出中间事件 AgentEvent + 最终 AgenticSearchResult
 */
export function createAgenticSearch(options: CreateAgenticSearchOptions) {
  const { providers: rawProviders, config, mode = 'auto', logger } = options;

  // 包裹外部 LLM provider，注入默认选项（agentic search 全程禁用 thinking）
  const providers: AgenticSearchProviders = {
    ...rawProviders,
    llm: wrapProviderWithDefaults(rawProviders.llm)
  };

  // 使用传入的 logger 或从 providers 获取，并注册为全局单例
  const resolvedLogger = logger ?? providers.logger;
  if (resolvedLogger) setGlobalLogger(resolvedLogger);

  const resolvedConfig = buildRequiredConfig(config);
  const recursionLimit = calculateRecursionLimit(resolvedConfig);

  return {
    /**
     * 同步调用
     *
     * 每次调用重建 graph（含 RequestContext），保证多 session 并发时状态完全隔离。
     * graph 编译为纯内存操作（< 5ms），远小于 LLM 调用延迟，无性能影响。
     */
    invoke: async (params: {
      query: string;
      datasetIds: string[];
      history?: Array<{ role: string; content: string }>;
      /** 调用方预计算的 query 变体，预填检索计划以避免重复 query_rewrite LLM 调用 */
      initialQueries?: string[];
      /** 调用方预先检索到的上下文（如 SQL 检索结果），agent 在 Blackboard Brief 中参考 */
      priorContext?: string;
      /** DB 采样的语言分布统计，用于初始化 LanguageTracker。null 表示采样失败/空 KB */
      initialLanguageStats?: Record<string, number> | null;
    }): Promise<AgenticSearchResult> => {
      const {
        query,
        datasetIds,
        history = [],
        initialQueries,
        priorContext,
        initialLanguageStats
      } = params;
      const startTime = Date.now();

      // per-request graph（含 RequestContext Blackboard），并发安全
      const compiled = buildGraph(mode, providers, config);

      const initialInput: Partial<AgenticRAGStateType> = {
        question: query,
        datasetIds,
        chatHistory: history as LLMMessage[],
        priorContext: priorContext || '',
        originalQuestion: query,
        ...(initialQueries?.length ? { rewriteQueries: initialQueries } : {}),
        ...(initialLanguageStats !== undefined ? { initialLanguageStats } : {})
      };

      const finalState = await compiled.invoke(initialInput as AgenticRAGStateType, {
        recursionLimit
      });
      const result = mapStateToResult(finalState);

      // 计算各阶段耗时
      const totalMs = Date.now() - startTime;
      resolvedLogger?.info(`[Runner] Elapsed: ${(totalMs / 1000).toFixed(1)}s`);
      resolvedLogger?.info(`  Playbook:       ${result.playbook}`);
      resolvedLogger?.info(`  Tool Calls:     ${result.toolCallCount}`);
      resolvedLogger?.info(`  Search Count:   ${result.searchCount}`);
      resolvedLogger?.info(`  Chunks Found:   ${result.chunks.length}`);

      return result;
    },

    /**
     * 流式调用（对齐 Python run_query_stream）
     * 每次 yield AgentEvent（中间步骤）或 AgenticSearchResult（最终结果）
     */
    stream: async function* (params: {
      query: string;
      datasetIds: string[];
      history?: Array<{ role: string; content: string }>;
      /** 调用方预计算的 query 变体，预填检索计划以避免重复 query_rewrite LLM 调用 */
      initialQueries?: string[];
      /** 调用方预先检索到的上下文（如 SQL 检索结果），agent 在 Blackboard Brief 中参考 */
      priorContext?: string;
      /** DB 采样的语言分布统计，用于初始化 LanguageTracker。null 表示采样失败/空 KB */
      initialLanguageStats?: Record<string, number> | null;
    }): AsyncGenerator<AgentEvent | AgenticSearchResult> {
      const {
        query,
        datasetIds,
        history = [],
        initialQueries,
        priorContext,
        initialLanguageStats
      } = params;
      const startTime = Date.now();

      // Yield started 事件
      yield {
        step: AGENT_EVENTS.STARTED,
        detail: query,
        timestamp: startTime
      };

      // 构建 initial_state
      const initialInput: Partial<AgenticRAGStateType> = {
        question: query,
        datasetIds,
        chatHistory: history as LLMMessage[],
        priorContext: priorContext || '',
        startTime: startTime,
        originalQuestion: query,
        // 软提示（soft hint）：若调用方提供了预计算的查询变体，预填 rewriteQueries。
        // Blackboard Brief 的 Plan 区将展示这些查询，引导 Agent 优先直接检索而非重新改写。
        // 注意：这是软约束，Agent 仍可在后续轮次（如 deep_research）中调用 query_rewrite 工具进行二次改写。
        ...(initialQueries?.length ? { rewriteQueries: initialQueries } : {}),
        ...(initialLanguageStats !== undefined ? { initialLanguageStats } : {})
      };

      // per-request graph（含 RequestContext Blackboard），并发安全
      const compiled = buildGraph(mode, providers, config);

      let finalState: AgenticRAGStateType | null = null;

      // 手动累积完整 state（LangGraph updates 模式只给 delta，不给全量 state）
      // 对齐 state.ts 中定义的 reducer 规则：replace / append / smart-merge
      const accState: Partial<AgenticRAGStateType> = { ...initialInput };

      function mergeStateUpdate(delta: Partial<AgenticRAGStateType>): void {
        // ── replace reducers ────────────────────────────────────
        if (delta.playbook !== undefined) accState.playbook = delta.playbook;
        if (delta.analysis !== undefined) accState.analysis = delta.analysis;
        if (delta.reason !== undefined) accState.reason = delta.reason;
        if (delta.toolCallCount !== undefined) accState.toolCallCount = delta.toolCallCount;
        if (delta.searchCount !== undefined) accState.searchCount = delta.searchCount;
        if (delta.iterationCount !== undefined) accState.iterationCount = delta.iterationCount;
        if (delta.answer !== undefined) accState.answer = delta.answer;
        if (delta.confidence !== undefined) accState.confidence = delta.confidence;
        if (delta.done !== undefined) accState.done = delta.done;
        if (delta.selectedChunks !== undefined) accState.selectedChunks = delta.selectedChunks;
        if (delta.pendingToolCalls !== undefined)
          accState.pendingToolCalls = delta.pendingToolCalls;
        if (delta.rewriteQueries !== undefined) accState.rewriteQueries = delta.rewriteQueries;
        if (delta.lastSearchOverlap !== undefined)
          accState.lastSearchOverlap = delta.lastSearchOverlap;
        if (delta.reflectionLabel !== undefined) accState.reflectionLabel = delta.reflectionLabel;
        if (delta.reflectionReason !== undefined)
          accState.reflectionReason = delta.reflectionReason;
        if (delta.refuse !== undefined) accState.refuse = delta.refuse;
        if (delta.ttftMs !== undefined) accState.ttftMs = delta.ttftMs;
        if (delta.citedIds !== undefined) accState.citedIds = delta.citedIds;
        if (delta.error !== undefined) accState.error = delta.error;
        if (delta.languageTrackerConfig !== undefined)
          accState.languageTrackerConfig = delta.languageTrackerConfig;
        // ── additive reducers ───────────────────────────────────
        if (delta.embeddingTokens !== undefined) {
          accState.embeddingTokens = (accState.embeddingTokens ?? 0) + delta.embeddingTokens;
        }
        if (delta.rerankInputTokens !== undefined) {
          accState.rerankInputTokens = (accState.rerankInputTokens ?? 0) + delta.rerankInputTokens;
        }
        if (delta.llmInputTokens !== undefined) {
          accState.llmInputTokens = (accState.llmInputTokens ?? 0) + delta.llmInputTokens;
        }
        if (delta.llmOutputTokens !== undefined) {
          accState.llmOutputTokens = (accState.llmOutputTokens ?? 0) + delta.llmOutputTokens;
        }
        // ── append reducers ─────────────────────────────────────
        if (delta.executionPath !== undefined) {
          accState.executionPath = [...(accState.executionPath ?? []), ...delta.executionPath];
        }
        if (delta.searchQueries !== undefined) {
          accState.searchQueries = [...(accState.searchQueries ?? []), ...delta.searchQueries];
        }
        if (delta.nodeHist !== undefined) {
          accState.nodeHist = [...(accState.nodeHist ?? []), ...(delta.nodeHist as any[])];
        }
        // ── smart merge for allChunks (deduplicate by id, keep higher score) ──
        if (delta.allChunks !== undefined) {
          const existing = new Map(
            (accState.allChunks ?? []).map((c, i) => [c.id, i] as [string, number])
          );
          const newList = [...(accState.allChunks ?? [])];
          for (const chunk of delta.allChunks) {
            const idx = existing.get(chunk.id);
            if (idx === undefined) {
              existing.set(chunk.id, newList.length);
              newList.push(chunk);
            } else {
              const cur = newList[idx];
              if (
                ((chunk as any).rerankScore ?? chunk.score) >
                ((cur as any).rerankScore ?? cur.score)
              ) {
                newList[idx] = chunk;
              }
            }
          }
          accState.allChunks = newList;
        }
      }

      try {
        // LangGraph stream 默认 "updates" 模式（每次 yield 节点增量 delta）
        const stream = await compiled.stream(initialInput as AgenticRAGStateType, {
          recursionLimit
        });
        for await (const chunk of stream) {
          for (const [nodeName, nodeOutput] of Object.entries(
            chunk as Record<string, Partial<AgenticRAGStateType>>
          )) {
            // 将 delta 合并到累积 state
            mergeStateUpdate(nodeOutput);

            const events = mapNodeUpdateToEvent(nodeName, nodeOutput);
            for (const event of events) {
              if (event) yield event;
            }
          }
        }
        // 流结束后使用累积完整 state
        if (accState.done || accState.answer) {
          finalState = accState as AgenticRAGStateType;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        yield {
          step: AGENT_EVENTS.ERROR,
          detail: errorMsg,
          timestamp: Date.now()
        };
        return;
      }

      // fallback：若流未能获取有效 state，重新 invoke（不应发生）
      if (!finalState) {
        try {
          const result = await compiled.invoke(initialInput as AgenticRAGStateType, {
            recursionLimit
          });
          finalState = result;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          yield {
            step: AGENT_EVENTS.ERROR,
            detail: `Final invoke failed: ${errorMsg}`,
            timestamp: Date.now()
          };
          return;
        }
      }

      yield {
        step: AGENT_EVENTS.FINAL,
        detail: 'Execution complete',
        timestamp: Date.now(),
        extra: {
          answer: finalState.answer,
          confidence: finalState.confidence,
          toolCallCount: finalState.toolCallCount,
          searchCount: finalState.searchCount,
          citedIds: finalState.citedIds,
          reflectionLabel: finalState.reflectionLabel,
          refuse: finalState.refuse || undefined
        }
      };

      // 最后 yield 最终结果
      yield mapStateToResult(finalState);
    },

    /**
     * 获取当前配置（只读）
     */
    getConfig: () => resolvedConfig
  };
}
