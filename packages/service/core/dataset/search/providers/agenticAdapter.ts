/**
 * agenticAdapter.ts
 * 将 diting-rag-ts 的 ChunkItem[] 转换为 FastGPT 的 SearchDataResponseItemType[]
 * 所有 FastGPT 平台特有字段从 providerMetadata 中读取
 */

import type { ChunkItem } from 'diting-rag-ts';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';

type FastGPTChunkMeta = {
  q?: string;
  a?: string;
  collectionId?: string;
  sourceId?: string;
  documentId?: string;
  fileId?: string;
  imageId?: string;
  imageDescMap?: Record<string, string>;
  originalScoreArray?: Array<{
    type: 'rrf' | 'embedding' | 'fullText' | 'reRank';
    value: number;
    index: number;
  }>;
  chunkIndex?: number;
  updateTime?: Date;
};

/**
 * 将 diting-rag-ts 最终检索结果转换为 FastGPT 格式
 * - 从 providerMetadata 读取 q/a/sourceId/imageId 等平台字段
 * - 重建 score 数组，更新 index 为最终排名，重算 rrf value
 */
export function chunkItemsToSearchResults(chunks: ChunkItem[]): SearchDataResponseItemType[] {
  return chunks.map((chunk, index) => {
    const meta = (chunk.providerMetadata ?? {}) as FastGPTChunkMeta;

    // 使用原始 score 数组；rrf value 按 agentic 最终位置重算，避免与原始排名冲突
    const score = meta.originalScoreArray
      ? meta.originalScoreArray.map((s) => ({
          ...s,
          index,
          value: s.type === 'rrf' ? 1 / (60 + index + 1) : s.value
        }))
      : [{ type: 'rrf' as const, value: 1 / (60 + index + 1), index }];

    return {
      id: chunk.id,
      q: meta.q ?? chunk.content,
      a: meta.a ?? '',
      datasetId: chunk.datasetId,
      collectionId: meta.collectionId ?? chunk.collectionId ?? '',
      sourceName: chunk.sourceName,
      sourceId: meta.sourceId,
      score,
      metadata: chunk.metadata,
      updateTime: meta.updateTime ?? new Date(),
      chunkIndex: meta.chunkIndex ?? 0,
      imageId: meta.imageId,
      retrievalRank: index
    } as SearchDataResponseItemType;
  });
}
