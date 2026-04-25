// src/types/chunk.ts
// 检索结果 chunk 类型

export interface ChunkResult {
  // 核心字段
  id: string;
  content: string;
  score: number;
  datasetId: string;
  sourceName: string;
  collectionId?: string;
  metadata?: Record<string, unknown>;

  // 检索来源与原始分数
  searchSource?: 'vector' | 'fulltext' | 'mixed' | 'web';
  vectorScore?: number;
  fullTextScore?: number;

  // Provider 特定元数据（透传）
  providerMetadata?: Record<string, unknown>;

  // 时间戳
  timestamp?: number;

  // 语言标注（ISO 639-1 代码，由索引时 detectLang 写入 metadata.detectedLanguage）
  detectedLanguage?: string;
}

/**
 * 内部使用的 ChunkItem，包含更多运行时信息
 */
export interface ChunkItem extends ChunkResult {
  indexes?: number[];
  rerankScore?: number;
  llm_sub_query_score?: number;
  _rawChunk?: unknown;
}

export interface QueryResult {
  query: string;
  chunks: ChunkItem[];
  searchMode: string;
}

export function createChunkResult(data: Partial<ChunkResult>): ChunkResult {
  return {
    id: data.id || '',
    content: data.content || '',
    score: data.score || 0,
    datasetId: data.datasetId || '',
    sourceName: data.sourceName || '',
    collectionId: data.collectionId,
    metadata: data.metadata || {},
    searchSource: data.searchSource,
    vectorScore: data.vectorScore,
    fullTextScore: data.fullTextScore,
    providerMetadata: data.providerMetadata,
    timestamp: data.timestamp
  };
}

export function migrateChunkResult(old: any): ChunkResult {
  return createChunkResult({
    id: old.id,
    content: old.content,
    score: old.score,
    datasetId: old.datasetId,
    sourceName: old.sourceName,
    collectionId: old.collectionId,
    metadata: old.metadata
  });
}
