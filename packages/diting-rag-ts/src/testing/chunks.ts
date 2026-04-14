// src/testing/chunks.ts
// 测试用 Mock Chunks

import type { ChunkResult } from '../types/chunk';

/**
 * 创建测试用 chunks
 */
export function createMockChunks(count: number = 5): ChunkResult[] {
  const baseChunks: ChunkResult[] = [
    {
      id: 'chunk-1',
      content: 'FastGPT 是一个基于 LLM 的知识库问答系统，支持多种模型接入。',
      score: 0.95,
      datasetId: 'dataset-1',
      sourceName: 'FastGPT 文档',
      collectionId: 'collection-1',
      metadata: { type: 'documentation' }
    },
    {
      id: 'chunk-2',
      content: 'DiTing 是企业级智能客服系统，支持多轮对话和知识库检索。',
      score: 0.88,
      datasetId: 'dataset-1',
      sourceName: 'DiTing 文档',
      collectionId: 'collection-1',
      metadata: { type: 'documentation' }
    },
    {
      id: 'chunk-3',
      content: 'RAG (Retrieval Augmented Generation) 结合检索和生成，提升回答质量。',
      score: 0.82,
      datasetId: 'dataset-1',
      sourceName: 'RAG 教程',
      collectionId: 'collection-2',
      metadata: { type: 'tutorial' }
    },
    {
      id: 'chunk-4',
      content: '向量检索通过计算 Embedding 的相似度来找到相关内容。',
      score: 0.78,
      datasetId: 'dataset-1',
      sourceName: '向量检索指南',
      collectionId: 'collection-2',
      metadata: { type: 'tutorial' }
    },
    {
      id: 'chunk-5',
      content: '全文检索直接在文本中搜索关键词，适用于精确匹配场景。',
      score: 0.75,
      datasetId: 'dataset-1',
      sourceName: '全文检索指南',
      collectionId: 'collection-3',
      metadata: { type: 'tutorial' }
    }
  ];

  return baseChunks.slice(0, count);
}

/**
 * 创建空的 chunks
 */
export function createEmptyChunks(): ChunkResult[] {
  return [];
}
