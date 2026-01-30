export const DatasetVectorDbName = 'fastgpt';
export const DatasetVectorTableName = 'modeldata';

export const PG_ADDRESS = process.env.PG_URL;
export const OCEANBASE_ADDRESS = process.env.OCEANBASE_URL;
export const SEEKDB_ADDRESS = process.env.SEEKDB_URL;
export const MILVUS_ADDRESS = process.env.MILVUS_ADDRESS;
export const MILVUS_TOKEN = process.env.MILVUS_TOKEN;

export const VectorVQ = (() => {
  if (process.env.VECTOR_VQ_LEVEL === '32') {
    return 32;
  }
  if (process.env.VECTOR_VQ_LEVEL === '16') {
    return 16;
  }
  if (process.env.VECTOR_VQ_LEVEL === '8') {
    return 8;
  }
  if (process.env.VECTOR_VQ_LEVEL === '4') {
    return 4;
  }
  if (process.env.VECTOR_VQ_LEVEL === '2') {
    return 2;
  }
  return 32;
})();

/**
 * OceanBase HNSW Index Configuration
 *
 * VECTOR_VQ_LEVEL mapping:
 * - 32 (default): hnsw + inner_product
 * - 8: hnsw_sq + inner_product
 * - 1: hnsw_bq + cosine
 *
 * See https://www.oceanbase.com/docs/common-oceanbase-database-cn-1000000004920602
 * for the recommended way of choosing parameters (`m`, `ef_construction`, `ef_search`). It varies for data volume.
 *
 * HNSW_BQ requires cosine or l2 distance. inner_product is not supported up until V4.3.5 BP5 (current lts version until Jan 2026).
 * See https://www.oceanbase.com/docs/common-oceanbase-database-cn-1000000004920603
 * `HNSW_BQ distance 参数支持 l2 和 cosine。cosine 从 V4.3.5 BP4 版本开始支持。` and section `距离函数使用规则`.
 *
 * Tested on OceanBase 4.3.5-lts:
 * ```sql
 * -- HNSW_BQ + cosine: VECTOR INDEX SCAN ✓
 * CREATE VECTOR INDEX idx ON t(vec) WITH (distance=cosine, type=hnsw_bq, m=16, ef_construction=200);
 * EXPLAIN SELECT id, cosine_distance(vec, '[...]') AS score FROM t ORDER BY score ASC APPROXIMATE LIMIT 10;
 * -- |1 |└─VECTOR INDEX SCAN|t(idx)|
 * ```
 */
export const OceanBaseIndexConfig = (() => {
  const level = process.env.VECTOR_VQ_LEVEL;

  if (level === '1') {
    return {
      type: 'hnsw_bq' as const,
      distance: 'cosine' as const,
      distanceFunc: 'cosine_distance',
      orderDirection: 'ASC' as const,
      scoreTransform: (score: number) => 1 - score / 2
    };
  }

  if (level === '8') {
    return {
      type: 'hnsw_sq' as const,
      distance: 'inner_product' as const,
      distanceFunc: 'inner_product',
      orderDirection: 'DESC' as const,
      scoreTransform: (score: number) => score
    };
  }

  return {
    type: 'hnsw' as const,
    distance: 'inner_product' as const,
    distanceFunc: 'inner_product',
    orderDirection: 'DESC' as const,
    scoreTransform: (score: number) => score
  };
})();
