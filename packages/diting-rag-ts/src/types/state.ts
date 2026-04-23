// src/types/state.ts
// AgenticRAGState - 完整 LangGraph Annotation 定义
// 保留 Python 版的完整 Blackboard 模式设计

import { Annotation } from '@langchain/langgraph';
import type { ChunkItem } from './chunk';
import type { LLMMessage, ToolCall } from './message';

// ============================================================
// PlanStep（对齐 Python PlanStep dataclass）
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

// ============================================================
// NodeRecord（可观测性）
// ============================================================

export interface NodeRecord {
  node: string;
  toolCalls: string[];
  // answer 节点额外字段
  reflectionLabel?: string;
  reflectionReason?: string;
  confidence?: number;
  citedIds?: string[];
  llmCalls?: number;
  // tools 节点额外字段
  searchCount?: number;
  chunksTotal?: number;
}

// ============================================================
// AgenticRAGState - 完整版
// ============================================================

export const AgenticRAGState = Annotation.Root({
  // ── 输入字段（无 default，调用方必须提供）────────────────
  question: Annotation<string>(),
  datasetIds: Annotation<string[]>(),
  chatHistory: Annotation<LLMMessage[]>(),
  priorContext: Annotation<string>(),

  // ── 消息列表（支持 ID 替换，类似 Python add_messages）──
  messages: Annotation<LLMMessage[]>({
    reducer: (left: LLMMessage[], right: LLMMessage | LLMMessage[]) => {
      const toAdd = Array.isArray(right) ? right : [right];
      const result = [...left];
      for (const msg of toAdd) {
        if (msg.id) {
          // ID 替换：找到同 ID 的消息并替换（Blackboard Brief 模式）
          const idx = result.findIndex((m) => m.id === msg.id);
          if (idx >= 0) {
            result[idx] = msg;
            continue;
          }
        }
        result.push(msg);
      }
      return result;
    },
    default: () => []
  }),

  // ── 待执行 tool calls（replace reducer，节点间传递）───────
  pendingToolCalls: Annotation<ToolCall[]>({
    reducer: (_left: ToolCall[], right: ToolCall[]) => right,
    default: () => []
  }),

  // ── 检索结果（smart merge，按 id 去重保留高分版本）────────
  allChunks: Annotation<ChunkItem[]>({
    reducer: (left: ChunkItem[], right: ChunkItem[]) => {
      const merged = [...left];
      const existingIds = new Map(merged.map((c, i) => [c.id, i]));
      for (const chunk of right) {
        const idx = existingIds.get(chunk.id);
        if (idx === undefined) {
          existingIds.set(chunk.id, merged.length);
          merged.push(chunk);
        } else {
          const cur = merged[idx];
          if ((chunk.rerankScore ?? chunk.score) > (cur.rerankScore ?? cur.score)) {
            merged[idx] = chunk;
          }
        }
      }
      return merged;
    },
    default: () => []
  }),

  // ── 搜索查询历史（append reducer）────────────────────────
  searchQueries: Annotation<string[]>({
    reducer: (left: string[], right: string[]) => [...left, ...right],
    default: () => []
  }),

  // ── 改写计划查询（replace reducer，来自 query_rewrite）────
  rewriteQueries: Annotation<string[]>({ reducer: (_l, r) => r, default: () => [] }),

  // ── 最近一次搜索的重叠率（replace reducer，用于饱和检测）──
  lastSearchOverlap: Annotation<number>({ reducer: (_l, r) => r, default: () => 0 }),

  // ── 对比分析追踪（comparative_analysis playbook）────────
  compareObjects: Annotation<string[]>({ reducer: (_l, r) => r, default: () => [] }),
  discoveredDimensions: Annotation<string[]>({ reducer: (_l, r) => r, default: () => [] }),
  dimensionCoverage: Annotation<Record<string, { searched?: boolean; saturated?: boolean }>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({})
  }),

  // ── Blackboard：答案 ───────────────────────────────────────
  answer: Annotation<string>({ reducer: (_l, r) => r, default: () => '' }),
  citedIds: Annotation<string[]>({ reducer: (_l, r) => r, default: () => [] }),
  confidence: Annotation<number>({ reducer: (_l, r) => r, default: () => 0 }),
  reflectionLabel: Annotation<string>({ reducer: (_l, r) => r, default: () => '' }),
  reflectionReason: Annotation<string>({ reducer: (_l, r) => r, default: () => '' }),
  refuse: Annotation<boolean>({ reducer: (_l, r) => r, default: () => false }),

  // ── 流程控制 ─────────────────────────────────────────────
  playbook: Annotation<string>({ reducer: (_l, r) => r, default: () => 'general' }),
  analysis: Annotation<string>({ reducer: (_l, r) => r, default: () => '' }),
  reason: Annotation<string>({ reducer: (_l, r) => r, default: () => '' }),
  toolCallCount: Annotation<number>({ reducer: (_l, r) => r, default: () => 0 }),
  searchCount: Annotation<number>({ reducer: (_l, r) => r, default: () => 0 }),
  iterationCount: Annotation<number>({ reducer: (_l, r) => r, default: () => 0 }),

  // ── Token 统计（累加 reducer）─────────────────────────────
  embeddingTokens: Annotation<number>({ reducer: (l, r) => l + r, default: () => 0 }),
  rerankInputTokens: Annotation<number>({ reducer: (l, r) => l + r, default: () => 0 }),
  llmInputTokens: Annotation<number>({ reducer: (l, r) => l + r, default: () => 0 }),
  llmOutputTokens: Annotation<number>({ reducer: (l, r) => l + r, default: () => 0 }),

  // ── 可观测性（append reducer）────────────────────────────
  executionPath: Annotation<string[]>({
    reducer: (left: string[], right: string[]) => [...left, ...right],
    default: () => []
  }),
  nodeHist: Annotation<NodeRecord[]>({
    reducer: (left: NodeRecord[], right: NodeRecord[]) => [...left, ...right],
    default: () => []
  }),

  // ── 执行计划（plan_executor 使用，replace reducer）────────
  pendingPlan: Annotation<PlanStep[]>({ reducer: (_l, r) => r, default: () => [] }),

  // ── 渐进式信息收集（findings: append, lacks: replace 快照）──
  findings: Annotation<string[]>({
    reducer: (left: string[], right: string[]) => [...left, ...right],
    default: () => []
  }),
  lacks: Annotation<string[]>({ reducer: (_l, r) => r, default: () => [] }),

  // ── @assess 工具：chunk 标注（replace reducer）────────────
  keyChunkAnnotations: Annotation<Record<string, string | null>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({})
  }),
  // @assess lacks 稳定性检测（内部，上一轮 lacks 快照）
  prevLacksSet: Annotation<string>({ reducer: (_l, r) => r, default: () => '' }),

  // ── 控制标志 ─────────────────────────────────────────────
  done: Annotation<boolean>({ reducer: (_l, r) => r, default: () => false }),
  error: Annotation<string>({ reducer: (_l, r) => r, default: () => '' }),

  // ── searchOnly 模式：LLM chunk selector 选出的最终 chunks（replace reducer）────
  // 普通模式下为空；searchOnly=true 时由 @summary / auto_answer 节点填充
  selectedChunks: Annotation<ChunkItem[]>({ reducer: (_l, r) => r, default: () => [] }),

  // ── 原始问题（用于 answer final rerank）────────────────────
  originalQuestion: Annotation<string>({ reducer: (_l, r) => r, default: () => '' }),

  // ── 时间追踪（用于 TTFT 统计）────────────────────────────
  startTime: Annotation<number>({ reducer: (_l, r) => r, default: () => Date.now() }),
  ttftMs: Annotation<number | undefined>({ reducer: (_l, r) => r, default: () => undefined })
});

// 状态类型别名
export type AgenticRAGStateType = typeof AgenticRAGState.State;
export type AgenticRAGUpdateType = typeof AgenticRAGState.Update;
