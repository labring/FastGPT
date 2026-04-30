// src/agent/graph.ts
// Agentic RAG Graph - StateGraph 结构连线（三种模式）
//
// 职责：纯图结构，使用 state.ts/tools.ts/nodes.ts 中的定义，
// 只负责 addNode + addEdge + compile。
// 调用方（runner.ts）负责把 CompiledStateGraph 包装为公共 API。
//
// 混合机制：使用 RequestContext (Blackboard) + sync_blackboard 节点
// - ctx 通过闭包传递给 tools，tools 直接修改 ctx
// - tools 执行后通过 sync_blackboard 节点同步 ctx → state

import { StateGraph, END, START } from '@langchain/langgraph';
import type { AgenticSearchConfig, AgenticSearchProviders } from '../ports/agentic';
import { AgenticRAGState } from '../types/state';
import { RetrieveSkill } from '../skills/atomic/retrieve';
import { RerankSkill } from '../skills/atomic/rerank';
import { ChunkSelectorSkill } from '../skills/atomic/chunk_selector';
import { SearchSkill } from '../skills/expertise/search';
import { AnswerSkill } from '../skills/expertise/answer';
import { QueryRewriteSkill } from '../skills/expertise/query_rewrite/index';
import {
  createRoutePlaybookNode,
  createNativeAgentNode,
  createTextAgentNode,
  createAutoAgentNode,
  createToolsNode,
  createSelectChunksNode,
  createGenerateAnswerNode,
  createPlanExecutorNode,
  createSyncBlackboardNode,
  createShouldContinue,
  createAfterSyncRoute
} from './nodes';
import { RequestContext } from './context';
import { DEFAULT_SEARCH_CONFIG } from '../utils/constants';

// ============================================================
// 公共类型（re-export state types for runner.ts 等使用）
// ============================================================

export type { AgenticRAGStateType, AgenticRAGUpdateType } from '../types/state';

// ============================================================
// Graph Mode
// ============================================================

export type GraphMode = 'native' | 'text' | 'auto';

// ============================================================
// Skill Bundle（图内部工厂，供节点共享）
// ============================================================

export interface SkillBundle {
  searchSkill: SearchSkill;
  answerSkill: AnswerSkill;
  rewriteSkill: QueryRewriteSkill;
  rerankSkill: RerankSkill;
  chunkSelectorSkill: ChunkSelectorSkill;
}

export function createSkills(providers: AgenticSearchProviders): SkillBundle {
  const { llm, vectorSearch, fullTextSearch, embed, reranker, mixedSearch } = providers;

  const retrieveSkill = new RetrieveSkill();
  retrieveSkill.initialize(llm);
  retrieveSkill.initializeProviders(vectorSearch, fullTextSearch, embed, mixedSearch);

  const rerankSkill = new RerankSkill();
  rerankSkill.initialize(llm);
  if (reranker) {
    rerankSkill.initializeProvider(reranker);
  }

  const chunkSelectorSkill = new ChunkSelectorSkill();
  chunkSelectorSkill.initializeProvider(llm);

  const searchSkill = new SearchSkill();
  searchSkill.initialize(llm);
  searchSkill.initializeSkills(retrieveSkill, rerankSkill);

  const answerSkill = new AnswerSkill();
  answerSkill.initialize(llm);

  const rewriteSkill = new QueryRewriteSkill();
  rewriteSkill.initialize(llm);

  return { searchSkill, answerSkill, rewriteSkill, rerankSkill, chunkSelectorSkill };
}

// ============================================================
// Config 工具函数（供 runner.ts 使用）
// ============================================================

export function buildRequiredConfig(config?: AgenticSearchConfig): Required<AgenticSearchConfig> {
  return {
    searchMode: config?.searchMode ?? DEFAULT_SEARCH_CONFIG.SEARCH_MODE,
    maxSearchRounds: config?.maxSearchRounds ?? DEFAULT_SEARCH_CONFIG.MAX_SEARCH_ROUNDS,
    maxToolCalls: config?.maxToolCalls ?? DEFAULT_SEARCH_CONFIG.MAX_TOOL_CALLS,
    maxSearchCalls: config?.maxSearchCalls ?? 5,
    maxIterations: config?.maxIterations ?? 20,
    tokenBudget: config?.tokenBudget ?? 12000,
    embeddingWeight: config?.embeddingWeight ?? DEFAULT_SEARCH_CONFIG.EMBEDDING_WEIGHT,
    similarity: config?.similarity ?? DEFAULT_SEARCH_CONFIG.SIMILARITY_THRESHOLD,
    rerankTopK: config?.rerankTopK ?? DEFAULT_SEARCH_CONFIG.RERANK_TOP_K,
    retrieveLimit: config?.retrieveLimit ?? DEFAULT_SEARCH_CONFIG.RETRIEVE_LIMIT,
    answerMaxChunks: config?.answerMaxChunks ?? DEFAULT_SEARCH_CONFIG.ANSWER_MAX_CHUNKS,
    answerMaxTokens: config?.answerMaxTokens ?? DEFAULT_SEARCH_CONFIG.ANSWER_MAX_TOKENS,
    enableShowReferences: config?.enableShowReferences ?? true,
    // 信息增益（simple_query 早停信号3）
    enableInfoGain: config?.enableInfoGain ?? true,
    infoGainThreshold: config?.infoGainThreshold ?? 0.1,
    infoGainMaxHistory: config?.infoGainMaxHistory ?? 10,
    searchOnly: config?.searchOnly ?? false
  };
}

/**
 * 计算安全的 recursion_limit（对齐 Python recursion_limit）
 *
 * Native graph cycle: agent → tools → sync_blackboard = 3 nodes per tool call
 * Plus: playbook_router → agent (2) + select_chunks + generate_answer (2) + buffer (5)
 * Plus: plan_executor → sync_blackboard cycle (+2)
 *
 * Auto graph reuses the same formula: text-react fallback (agent_loop) is a
 * single non-cycling node, so it never exceeds the native cycle count.
 */
export function calculateRecursionLimit(config: Required<AgenticSearchConfig>): number {
  return 3 * config.maxToolCalls + 10;
}

// ============================================================
// Graph 构建函数（直接返回 CompiledStateGraph）
// 混合机制：ctx 通过闭包传递给 tools，sync_blackboard 节点同步 ctx → state
// ============================================================

/**
 * 构建 native tool calling graph（对齐 Python _build_native_graph）
 */
export function buildNativeGraph(
  providers: AgenticSearchProviders,
  config: Required<AgenticSearchConfig>
) {
  const skills = createSkills(providers);
  skills.rewriteSkill.loadStrategies().catch(() => {});

  // 创建 RequestContext (Blackboard)，通过闭包传递给 tools
  const ctx = new RequestContext(config, [], providers, providers.logger);

  // 获取 tool 名称列表（用于 progress guidance）
  const toolNames = ['search', 'query_rewrite', 'summary'];

  return new StateGraph(AgenticRAGState)
    .addNode('route_playbook', createRoutePlaybookNode(providers, config))
    .addNode('agent', createNativeAgentNode(providers, config))
    .addNode('tools', createToolsNode(providers, skills, config, ctx))
    .addNode('sync_blackboard', createSyncBlackboardNode(ctx, config, toolNames))
    .addNode('select_chunks', createSelectChunksNode(providers, skills, config))
    .addNode('generate_answer', createGenerateAnswerNode(providers, skills, config))
    .addNode('plan_executor', createPlanExecutorNode(providers, skills, config, ctx))
    .addEdge(START, 'route_playbook')
    .addEdge('route_playbook', 'sync_blackboard')
    .addConditionalEdges('agent', createShouldContinue(config, ctx), {
      tools: 'tools',
      select_chunks: 'select_chunks',
      [END]: END
    })
    .addEdge('tools', 'sync_blackboard')
    .addConditionalEdges('sync_blackboard', createAfterSyncRoute(ctx), {
      plan_executor: 'plan_executor',
      agent: 'agent',
      select_chunks: 'select_chunks',
      [END]: END
    })
    .addConditionalEdges('plan_executor', createAfterSyncRoute(ctx), {
      plan_executor: 'plan_executor',
      agent: 'agent',
      select_chunks: 'select_chunks',
      [END]: END
    })
    .addConditionalEdges('select_chunks', (state) => (state.done ? END : 'generate_answer'), {
      generate_answer: 'generate_answer',
      [END]: END
    })
    .addEdge('generate_answer', END)
    .compile();
}

/**
 * 构建 text ReAct graph（对齐 Python _build_text_react_graph）
 */
export function buildTextReActGraph(
  providers: AgenticSearchProviders,
  config: Required<AgenticSearchConfig>
) {
  const skills = createSkills(providers);
  skills.rewriteSkill.loadStrategies().catch(() => {});

  // 创建 RequestContext (Blackboard)
  const ctx = new RequestContext(config, [], providers, providers.logger);

  // 获取 tool 名称列表
  const toolNames = ['search', 'query_rewrite', 'summary'];

  return new StateGraph(AgenticRAGState)
    .addNode('route_playbook', createRoutePlaybookNode(providers, config))
    .addNode('agent', createTextAgentNode(providers, config))
    .addNode('tools', createToolsNode(providers, skills, config, ctx))
    .addNode('sync_blackboard', createSyncBlackboardNode(ctx, config, toolNames))
    .addNode('select_chunks', createSelectChunksNode(providers, skills, config))
    .addNode('generate_answer', createGenerateAnswerNode(providers, skills, config))
    .addNode('plan_executor', createPlanExecutorNode(providers, skills, config, ctx))
    .addEdge(START, 'route_playbook')
    .addEdge('route_playbook', 'sync_blackboard')
    .addConditionalEdges('agent', createShouldContinue(config, ctx), {
      tools: 'tools',
      select_chunks: 'select_chunks',
      [END]: END
    })
    .addEdge('tools', 'sync_blackboard')
    .addConditionalEdges('sync_blackboard', createAfterSyncRoute(ctx), {
      plan_executor: 'plan_executor',
      agent: 'agent',
      select_chunks: 'select_chunks',
      [END]: END
    })
    .addConditionalEdges('plan_executor', createAfterSyncRoute(ctx), {
      plan_executor: 'plan_executor',
      agent: 'agent',
      select_chunks: 'select_chunks',
      [END]: END
    })
    .addConditionalEdges('select_chunks', (state) => (state.done ? END : 'generate_answer'), {
      generate_answer: 'generate_answer',
      [END]: END
    })
    .addEdge('generate_answer', END)
    .compile();
}

/**
 * 构建 auto graph（native 优先，降级 text）
 */
export function buildAutoGraph(
  providers: AgenticSearchProviders,
  config: Required<AgenticSearchConfig>
) {
  const skills = createSkills(providers);
  skills.rewriteSkill.loadStrategies().catch(() => {});

  // 创建 RequestContext (Blackboard)
  const ctx = new RequestContext(config, [], providers, providers.logger);

  // 获取 tool 名称列表
  const toolNames = ['search', 'query_rewrite', 'summary'];

  return new StateGraph(AgenticRAGState)
    .addNode('route_playbook', createRoutePlaybookNode(providers, config))
    .addNode('agent', createAutoAgentNode(providers, config))
    .addNode('tools', createToolsNode(providers, skills, config, ctx))
    .addNode('sync_blackboard', createSyncBlackboardNode(ctx, config, toolNames))
    .addNode('select_chunks', createSelectChunksNode(providers, skills, config))
    .addNode('generate_answer', createGenerateAnswerNode(providers, skills, config))
    .addNode('plan_executor', createPlanExecutorNode(providers, skills, config, ctx))
    .addEdge(START, 'route_playbook')
    .addEdge('route_playbook', 'sync_blackboard')
    .addConditionalEdges('agent', createShouldContinue(config, ctx), {
      tools: 'tools',
      select_chunks: 'select_chunks',
      [END]: END
    })
    .addEdge('tools', 'sync_blackboard')
    .addConditionalEdges('sync_blackboard', createAfterSyncRoute(ctx), {
      plan_executor: 'plan_executor',
      agent: 'agent',
      select_chunks: 'select_chunks',
      [END]: END
    })
    .addConditionalEdges('plan_executor', createAfterSyncRoute(ctx), {
      plan_executor: 'plan_executor',
      agent: 'agent',
      select_chunks: 'select_chunks',
      [END]: END
    })
    .addConditionalEdges('select_chunks', (state) => (state.done ? END : 'generate_answer'), {
      generate_answer: 'generate_answer',
      [END]: END
    })
    .addEdge('generate_answer', END)
    .compile();
}

/**
 * 构建 Agentic RAG Graph（完整版入口）
 * - "native": LLM 原生 function calling
 * - "text":   Text ReAct，@tool_name() / <tool_call> XML 解析
 * - "auto":   native 优先，降级 text（默认）
 */
export function buildGraph(
  mode: GraphMode,
  providers: AgenticSearchProviders,
  config?: AgenticSearchConfig
) {
  const resolvedConfig = buildRequiredConfig(config);
  if (mode === 'text') return buildTextReActGraph(providers, resolvedConfig);
  if (mode === 'auto') return buildAutoGraph(providers, resolvedConfig);
  return buildNativeGraph(providers, resolvedConfig);
}
