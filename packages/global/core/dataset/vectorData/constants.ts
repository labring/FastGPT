/** 严格大于一万条向量才按需构建知识库局部 HNSW。 */
export const DATASET_VECTOR_INDEX_MIN_ROWS = 10000;

/** 严格低于五千条才移除已有索引；中间区间保留现状，避免反复建删。 */
export const DATASET_VECTOR_INDEX_DROP_ROWS = 5000;

/** 所有向量 provider 共用的 HNSW 搜索宽度边界。 */
export const HNSW_EF_SEARCH_MIN = 100;
export const HNSW_EF_SEARCH_MAX = 1000;
