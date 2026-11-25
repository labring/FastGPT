import pg from 'pg';
import { DATASET_VECTOR_INDEX_DROP_ROWS } from '@fastgpt/global/core/dataset/vectorData/constants';
import type { EmbeddingRecallCtrlPropsType } from '../type';
import { DatasetVectorTableName } from '../constants';

/** 可用的局部索引分库取候选，其余知识库合并精确检索，最后按同一内积排序。 */
export const buildOpenGaussVectorRecallQuery = ({
  teamId,
  datasetIds,
  datasetVectorData = [],
  vector,
  limit,
  forbidCollectionIdList,
  filterCollectionIdList
}: EmbeddingRecallCtrlPropsType) => {
  const ids = [...new Set(datasetIds.map(String))];
  const forbidden = new Set(forbidCollectionIdList.map(String));
  const allowed = filterCollectionIdList?.map(String).filter((id) => !forbidden.has(id));
  if (!ids.length || limit <= 0 || allowed?.length === 0) return;
  if (!Number.isSafeInteger(limit) || !vector.length || !vector.every(Number.isFinite)) {
    throw new Error('Invalid openGauss vector recall input');
  }

  const values: unknown[] = [`[${vector.join(',')}]`, limit];
  const where = [`team_id = ${pg.escapeLiteral(String(teamId))}`];
  if (allowed || forbidden.size > 0) {
    values.push(allowed ?? [...forbidden]);
    const match = `collection_id = ANY($${values.length}::varchar[])`;
    where.push(allowed ? match : `NOT (${match})`);
  }
  const ready = new Set(
    datasetVectorData
      .filter(
        (item) => item.openGaussIndex === 'ready' && item.rows >= DATASET_VECTOR_INDEX_DROP_ROWS
      )
      .map((item) => String(item.datasetId))
  );
  const indexed = ids.filter((id) => ready.has(id));
  const exact = ids.filter((id) => !ready.has(id));
  const distance = 'vector <#> $1::vector';
  // 常量谓词与索引定义相同，使规划器可证明当前分组满足局部索引条件。
  const groups = indexed.map(
    (id) => `(SELECT id, collection_id, ${distance} AS score FROM ${DatasetVectorTableName}
      WHERE ${where.join(' AND ')} AND dataset_id = ${pg.escapeLiteral(id)}
      ORDER BY score LIMIT $2)`
  );
  if (exact.length > 0) {
    values.push(exact);
    groups.push(`(SELECT id, collection_id, ${distance} AS score FROM ${DatasetVectorTableName}
      WHERE ${where.join(' AND ')} AND dataset_id = ANY($${values.length}::varchar[])
      ORDER BY (${distance}) + 0, id LIMIT $2)`);
  }

  return {
    text: `SELECT id, collection_id, score FROM (${groups.join('\nUNION ALL\n')}) AS candidates
      ORDER BY score, id LIMIT $2`,
    values,
    usesHnsw: indexed.length > 0
  };
};
