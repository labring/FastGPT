// src/agent/nodes/index.ts
// Agent 节点函数

import type { RequestContext } from '../context';
import type { ChunkItem } from '../../types/chunk';

/**
 * Search 节点
 */
export async function createSearchNode(
  state: Record<string, unknown>,
  context: RequestContext
): Promise<Record<string, unknown>> {
  const searchQueries = state.searchQueries as string[] | undefined;
  const datasetIds = state.datasetIds as string[] | undefined;
  const tokenBudget = state.tokenBudget as number | undefined;
  const enableRerank = state.enableRerank as boolean | undefined;

  context.emit('search', `Searching with ${searchQueries?.length || 0} queries`);

  // 调用 search skill
  const result = await context.searchSkill.execute({
    queries: searchQueries || [],
    datasetIds: datasetIds || [],
    tokenBudget: tokenBudget || 8000,
    enableRerank: enableRerank ?? true,
    retrieveLimit: context.config.retrieveLimit
  });

  if (!result.success) {
    context.emit('search_error', result.error);
    return {};
  }

  const data = result.data as { chunks: ChunkItem[]; queries: string[] };
  context.addChunksSmart(data.chunks);
  context.searchCount++;

  return {
    allChunks: context.allChunks,
    searchQueries: data.queries,
    searchCount: context.searchCount
  };
}

/**
 * Answer 节点
 */
export async function createAnswerNode(
  state: Record<string, unknown>,
  context: RequestContext
): Promise<Record<string, unknown>> {
  const question = state.question as string | undefined;
  const allChunks = state.allChunks as ChunkItem[] | undefined;
  const chatHistory = state.chatHistory as Array<{ role: string; content: string }> | undefined;

  context.emit('answer', 'Generating answer');

  // 调用 answer skill
  const result = await context.answerSkill.execute({
    query: question || '',
    chunks: allChunks || [],
    history: (chatHistory || []) as any,
    enableReflection: true,
    mode: 'chat'
  });

  if (!result.success) {
    context.emit('answer_error', result.error);
    return {};
  }

  const data = result.data as {
    answer: string;
    citedIds: string[];
    confidence: number;
    reflectionLabel: string;
    reflectionReason: string;
  };

  return {
    answer: data.answer,
    citedIds: data.citedIds,
    confidence: data.confidence,
    reflectionLabel: data.reflectionLabel,
    reflectionReason: data.reflectionReason
  };
}

/**
 * Chunk Selector 节点
 */
export async function createChunkSelectorNode(
  state: Record<string, unknown>,
  context: RequestContext
): Promise<Record<string, unknown>> {
  const question = state.question as string | undefined;
  const allChunks = state.allChunks as ChunkItem[] | undefined;
  const tokenBudget = state.tokenBudget as number | undefined;
  const playbook = state.playbook as string | undefined;

  context.emit('chunk_selector', `Selecting chunks with budget ${tokenBudget}`);

  // 调用 chunk selector skill
  const result = await context.chunkSelectorSkill.execute({
    query: question || '',
    chunks: allChunks || [],
    tokenBudget: tokenBudget || 8000,
    playbook: playbook || 'general'
  });

  if (!result.success) {
    context.emit('chunk_selector_error', result.error);
    return { allChunks: allChunks || [] };
  }

  const data = result.data as {
    selectedChunks: ChunkItem[];
    totalTokens: number;
  };

  // 更新历史（用于信息增益计算）
  for (const chunk of data.selectedChunks) {
    context.chunkSelectorSkill.addToHistory(chunk);
  }

  return {
    allChunks: data.selectedChunks
  };
}

/**
 * Query Rewrite 节点
 */
export async function createQueryRewriteNode(
  state: Record<string, unknown>,
  context: RequestContext
): Promise<Record<string, unknown>> {
  const question = state.question as string | undefined;
  const chatHistory = state.chatHistory as Array<{ role: string; content: string }> | undefined;

  context.emit('query_rewrite', 'Rewriting query');

  // 调用 rewrite skill
  const result = await context.rewriteSkill.execute({
    query: question || '',
    history: (chatHistory || []) as any,
    priorContext: context.priorContext || undefined
  });

  if (!result.success) {
    context.emit('query_rewrite_error', result.error);
    return { searchQueries: [question || ''] };
  }

  const data = result.data as {
    queries: string[];
    strategies_used: string[];
  };

  context.rewriteQueries = data.queries;
  context.emit('query_rewrite_result', `Generated ${data.queries.length} queries`);

  return {
    searchQueries: data.queries
  };
}
