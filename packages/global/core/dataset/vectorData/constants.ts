/** 严格大于三万条向量才按需构建知识库局部 HNSW。 */
export const DATASET_VECTOR_INDEX_MIN_ROWS = 30000;

/** 严格低于两万条才移除已有索引；中间区间保留现状，避免反复建删。 */
export const DATASET_VECTOR_INDEX_DROP_ROWS = 20000;
