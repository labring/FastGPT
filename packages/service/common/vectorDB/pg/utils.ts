import pg from 'pg';
import { DATASET_VECTOR_INDEX_MIN_ROWS } from '@fastgpt/global/core/dataset/vectorData/constants';
import type { EmbeddingRecallCtrlPropsType } from '../type';
import { DatasetVectorTableName } from '../constants';

/**
 * 将 ready 大库各自路由到 FP16 索引，其余库合并精确检索；所有分组各取 limit，再按 FP32 统一截断。
 * 局部索引谓词使用驱动转义后的常量，使 PG 无需依赖参数值就能证明谓词成立。
 */
export const buildPgVectorRecallQuery = ({
  teamId,
  datasetIds,
  datasetVectorData = [],
  vector,
  limit,
  forbidCollectionIdList,
  filterCollectionIdList
}: EmbeddingRecallCtrlPropsType) => {
  const ids = [...new Set(datasetIds.map(String))];
  if (ids.length === 0 || limit <= 0 || filterCollectionIdList?.length === 0) return;
  if (!Number.isSafeInteger(limit) || vector.length === 0 || !vector.every(Number.isFinite)) {
    throw new Error('Invalid PG vector recall input');
  }

  const forbidden = [...new Set(forbidCollectionIdList.map(String))];
  const allowed = filterCollectionIdList?.map(String).filter((id) => !forbidden.includes(id));
  if (allowed?.length === 0) return;

  // 1. 参数覆盖向量、limit、集合过滤；知识库和团队常量使用 pg.escapeLiteral。
  const values: unknown[] = [`[${vector.join(',')}]`, limit];
  const collectionClauses: string[] = [];
  if (allowed) {
    values.push(allowed);
    collectionClauses.push(`collection_id = ANY($${values.length}::varchar[])`);
  } else if (forbidden.length > 0) {
    values.push(forbidden);
    collectionClauses.push(`NOT (collection_id = ANY($${values.length}::varchar[]))`);
  }
  const baseWhere = [`team_id = ${pg.escapeLiteral(String(teamId))}`, ...collectionClauses].join(
    ' AND '
  );
  const metadata = new Map(datasetVectorData.map((item) => [String(item.datasetId), item]));
  const indexed = ids.filter((id) => {
    const data = metadata.get(id);
    return data?.pgIndex === 'ready' && data.rows > DATASET_VECTOR_INDEX_MIN_ROWS;
  });
  const indexedSet = new Set(indexed);
  const exact = ids.filter((id) => !indexedSet.has(id));

  // 2. 每个局部索引的候选集先物化，再用原始 FP32 向量重排，避免外层排序被下推。
  const candidates = indexed.map(
    (id, i) => `candidates_${i} AS MATERIALIZED (
      SELECT id, collection_id, vector
      FROM ${DatasetVectorTableName}
      WHERE ${baseWhere} AND dataset_id = ${pg.escapeLiteral(id)}
      ORDER BY vector::halfvec(${vector.length}) <#> $1::halfvec(${vector.length})
      LIMIT $2
    )`
  );
  const groups = indexed.map(
    (_, i) => `(SELECT id, collection_id, vector::vector <#> $1::vector AS score
      FROM candidates_${i}
      ORDER BY score LIMIT $2)`
  );

  if (exact.length > 0) {
    values.push(exact);
    // +0 阻止旧全局 HNSW 接管精确分组；仍允许 team/dataset/collection B-tree 过滤。
    groups.push(`(SELECT id, collection_id, vector::vector <#> $1::vector AS score
      FROM ${DatasetVectorTableName}
      WHERE ${baseWhere} AND dataset_id = ANY($${values.length}::varchar[])
      ORDER BY (vector::vector <#> $1::vector) + 0, id LIMIT $2)`);
  }

  return {
    text: `${candidates.length > 0 ? `WITH ${candidates.join(',\n')}` : ''}
      SELECT id, collection_id, score FROM (${groups.join('\nUNION ALL\n')}) AS grouped_results
      ORDER BY score, id LIMIT $2`,
    values,
    usesHnsw: indexed.length > 0
  };
};
