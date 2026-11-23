import type { FullTextSearchProps, FullTextSearchItem } from '../../../../common/vectorDB/type';
import { getSqlFullTextAdapter } from '../../../../common/vectorDB/fullText/controller';
import { MongoDatasetData } from '../../data/schema';

/**
 * 原生返回向量 ID，按当前主库引用、团队及知识库归属验证后映射为业务 ID。
 * 候选逐步扩大且最多 500 条；删除和旧向量残留不会变成有效业务命中。
 */
export const searchSqlFullText = async (
  props: FullTextSearchProps
): Promise<FullTextSearchItem[]> => {
  if (props.limit <= 0 || !props.query.trim() || !props.datasetIds.length) return [];
  const results: FullTextSearchItem[] = [];
  const seen = new Set<string>();
  let budget = Math.min(500, Math.max(props.limit, props.limit * 2));
  while (budget > 0) {
    const hits = await getSqlFullTextAdapter().search({ ...props, limit: budget });
    const docs = await MongoDatasetData.find(
      {
        teamId: props.teamId,
        datasetId: { $in: props.datasetIds },
        collectionId: { $in: hits.map((hit) => hit.collectionId) },
        'indexes.dataId': { $in: hits.map((hit) => hit.vectorId) }
      },
      { _id: 1, teamId: 1, datasetId: 1, collectionId: 1, indexes: 1 }
    )
      .read('primary')
      .lean();
    const mapping = new Map(
      docs.flatMap((doc) =>
        doc.indexes.map(
          (index) => [`${doc.collectionId}:${index.dataId}`, String(doc._id)] as const
        )
      )
    );
    for (const hit of hits) {
      const dataId = mapping.get(`${hit.collectionId}:${hit.vectorId}`);
      if (!dataId || seen.has(dataId)) continue;
      seen.add(dataId);
      results.push({ dataId, collectionId: hit.collectionId, score: hit.score });
      if (results.length >= props.limit) return results;
    }
    if (hits.length < budget || budget === 500) break;
    budget = Math.min(500, budget * 2);
  }
  return results;
};
