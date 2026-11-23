/**
 * 运维性能分析（Ops Performance）通用常量与分桶定义。
 *
 * 按 `domain` 隔离不同性能分析业务域（首发覆盖知识库搜索及其伴生域 Rerank、问题优化），
 * 后续新增工作流、模型推理、沙箱等域只需扩展 domain 枚举和对应 Zod 分支，无需改动存储集合。
 */

export const OpsPerfDomainValues = [
  'dataset.search',
  'dataset.rerank',
  'dataset.queryExtension'
] as const;

export type OpsPerfDomain = (typeof OpsPerfDomainValues)[number];

export const OpsPerfGranularityValues = ['1h'] as const;
export type OpsPerfGranularity = (typeof OpsPerfGranularityValues)[number];

export const OpsPerfEventReasonValues = ['error', 'degraded', 'sample'] as const;
export type OpsPerfEventReason = (typeof OpsPerfEventReasonValues)[number];

export const OpsPerfEventStatusValues = ['ok', 'degraded', 'error'] as const;
export type OpsPerfEventStatus = (typeof OpsPerfEventStatusValues)[number];

/** 知识库索引行数低基数规模分桶，防止高基数 datasetId 进入小时聚合桶。 */
export const DatasetIndexScaleValues = [
  's_10k',
  'm_100k',
  'l_500k',
  'xl_2m',
  'xxl_2m_plus',
  'unknown'
] as const;

export type DatasetIndexScale = (typeof DatasetIndexScaleValues)[number];

export const DatasetSearchModeFilterValues = [
  'embedding',
  'fullTextRecall',
  'mixedRecall',
  'unknown'
] as const;

export type DatasetSearchModeMetricValue = (typeof DatasetSearchModeFilterValues)[number];

export const VectorEngineMetricValues = [
  'pg',
  'milvus',
  'mongo',
  'oceanbase',
  'seekdb',
  'opengauss',
  'unknown'
] as const;

export type VectorEngineMetricValue = (typeof VectorEngineMetricValues)[number];

/**
 * 固定对数直方图上界（单位 ms）。
 * 索引 0..18 对应区间 [prevBound, bound]，索引 19 对应 (60000, +Inf) 溢出桶。
 * 多 Pod 可直接按桶索引原子 $inc 合并，无需存储原始样本即可精确估算 P50/P90/P95/P99。
 */
export const OPS_PERF_HISTOGRAM_BOUNDS_MS = [
  10, 25, 50, 100, 150, 200, 300, 450, 650, 1000, 1500, 2000, 3000, 5000, 8000, 12000, 20000, 30000,
  60000
] as const;

export const OPS_PERF_HISTOGRAM_OVERFLOW_BUCKET = OPS_PERF_HISTOGRAM_BOUNDS_MS.length;

/** 聚合桶默认保留天数（90 天），单点排查样本默认保留天数（7 天）。 */
export const OPS_PERF_BUCKET_RETENTION_DAYS = 90;
export const OPS_PERF_EVENT_RETENTION_DAYS = 7;

/** 知识库搜索阶段执行顺序与并行分组定义，供服务端汇总和前端链路拆解表共用。 */
export const DATASET_SEARCH_STAGE_SPECS = [
  {
    key: 'queryExtension',
    step: '1',
    group: 'serial'
  },
  {
    key: 'imageCaption',
    step: '1B',
    group: 'serial'
  },
  {
    key: 'filter',
    step: '2',
    group: 'serial'
  },
  {
    key: 'embeddingApi',
    step: '3A-1',
    group: 'parallel-vector'
  },
  {
    key: 'vectorRoute',
    step: '3A-2',
    group: 'parallel-vector'
  },
  {
    key: 'vectorLeaseWait',
    step: '3A-3',
    group: 'parallel-vector'
  },
  {
    key: 'vectorRecall',
    step: '3A-4',
    group: 'parallel-vector'
  },
  {
    key: 'vectorHydrate',
    step: '3A-5',
    group: 'parallel-vector'
  },
  {
    key: 'fullTextRecall',
    step: '3B-1',
    group: 'parallel-fulltext'
  },
  {
    key: 'fullTextHydrate',
    step: '3B-2',
    group: 'parallel-fulltext'
  },
  {
    key: 'rerank',
    step: '4',
    group: 'serial'
  },
  {
    key: 'postProcess',
    step: '5',
    group: 'serial'
  }
] as const;

export type DatasetSearchStageKey = (typeof DATASET_SEARCH_STAGE_SPECS)[number]['key'];
export type DatasetSearchStageGroup = (typeof DATASET_SEARCH_STAGE_SPECS)[number]['group'];

/** 向量链路涉及知识库/路由/并发排队/回表的全部阶段键。 */
export const DATASET_VECTOR_DB_STAGE_KEYS = [
  'vectorRoute',
  'vectorLeaseWait',
  'vectorRecall',
  'vectorHydrate'
] as const satisfies readonly DatasetSearchStageKey[];

/** 全文链路涉及知识库查询/回表的全部阶段键。 */
export const DATASET_FULLTEXT_DB_STAGE_KEYS = [
  'fullTextRecall',
  'fullTextHydrate'
] as const satisfies readonly DatasetSearchStageKey[];

/** 知识库搜索全链路数据库与路由阶段（不含 LLM/Embedding/Rerank 与纯内存后处理）。 */
export const DATASET_ALL_DB_STAGE_KEYS = [
  'filter',
  ...DATASET_VECTOR_DB_STAGE_KEYS,
  ...DATASET_FULLTEXT_DB_STAGE_KEYS
] as const satisfies readonly DatasetSearchStageKey[];

/**
 * 将本次检索覆盖的知识库总向量索引行数映射为低基数规模分桶。
 * 无法获取索引行数（undefined / 负数 / NaN）时回落到 `'unknown'`。
 */
export const resolveDatasetIndexScale = (indexCount?: number | null): DatasetIndexScale => {
  if (
    indexCount === undefined ||
    indexCount === null ||
    !Number.isFinite(indexCount) ||
    indexCount < 0
  ) {
    return 'unknown';
  }
  if (indexCount < 10_000) return 's_10k';
  if (indexCount < 100_000) return 'm_100k';
  if (indexCount < 500_000) return 'l_500k';
  if (indexCount < 2_000_000) return 'xl_2m';
  return 'xxl_2m_plus';
};
