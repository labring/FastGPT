import z from 'zod';
import {
  DatasetIndexScaleValues,
  DatasetSearchModeFilterValues,
  OpsPerfErrorCodeValues,
  OpsPerfEventReasonValues,
  OpsPerfEventStatusValues,
  OpsPerfGranularityValues,
  VectorEngineMetricValues
} from './constants';

export const OpsPerfHistogramSchema = z.record(z.string(), z.number().nonnegative());

export const OpsPerfTotalStatsSchema = z.object({
  count: z.number().nonnegative(),
  errorCount: z.number().nonnegative(),
  sumMs: z.number().nonnegative(),
  maxMs: z.number().nonnegative(),
  hist: OpsPerfHistogramSchema
});
export type OpsPerfTotalStats = z.infer<typeof OpsPerfTotalStatsSchema>;

export const OpsPerfStageBucketStatsSchema = z.object({
  count: z.number().nonnegative(),
  errorCount: z.number().nonnegative(),
  sumMs: z.number().nonnegative(),
  maxMs: z.number().nonnegative(),
  hist: OpsPerfHistogramSchema.optional()
});
export type OpsPerfStageBucketStats = z.infer<typeof OpsPerfStageBucketStatsSchema>;

/** 单点记录中单个阶段的相对起点与耗时（支持瀑布图精准呈现串/并行与重试跨度）。 */
export const OpsPerfEventStageTimingSchema = z.object({
  offsetMs: z
    .number()
    .nonnegative()
    .meta({ description: '相对本次检索起点的首次开始偏移 (ms)', example: 120 }),
  ms: z
    .number()
    .nonnegative()
    .meta({ description: '该阶段实际执行耗时（多调用区间并集，不含重试空档）(ms)', example: 85 }),
  endOffsetMs: z.number().nonnegative().optional().meta({
    description: '存在重试空档时的最晚结束相对偏移 (ms)，用于瀑布图完整标尺',
    example: 620
  }),
  callCount: z
    .number()
    .int()
    .positive()
    .optional()
    .meta({ description: '同阶段调用次数（多 query 并发或重试合并）', example: 2 }),
  errorCount: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .meta({ description: '阶段报错或静默降级次数', example: 0 })
});
export type OpsPerfEventStageTiming = z.infer<typeof OpsPerfEventStageTimingSchema>;

/* ==================== Domain 1: dataset.search ==================== */

export const DatasetSearchDimsSchema = z.object({
  searchMode: z
    .enum(DatasetSearchModeFilterValues)
    .catch('unknown')
    .meta({ description: '知识库检索模式', example: 'mixedRecall' }),
  indexScale: z
    .enum(DatasetIndexScaleValues)
    .catch('unknown')
    .meta({ description: '覆盖知识库总索引行数分桶', example: 'l_500k' }),
  usingReRank: z.boolean().meta({ description: '本次检索是否启用了结果重排', example: true }),
  usingExtension: z.boolean().meta({ description: '本次检索是否启用了问题优化', example: false }),
  vectorEngine: z
    .enum(VectorEngineMetricValues)
    .catch('unknown')
    .meta({ description: '执行检索时的向量库引擎类型', example: 'pg' })
});
export type DatasetSearchDims = z.infer<typeof DatasetSearchDimsSchema>;

export const DatasetSearchBucketStagesSchema = z.object({
  queryExtension: OpsPerfStageBucketStatsSchema.optional(),
  imageCaption: OpsPerfStageBucketStatsSchema.optional(),
  filter: OpsPerfStageBucketStatsSchema.optional(),
  embeddingApi: OpsPerfStageBucketStatsSchema.optional(),
  vectorRoute: OpsPerfStageBucketStatsSchema.optional(),
  vectorLeaseWait: OpsPerfStageBucketStatsSchema.optional(),
  vectorRecall: OpsPerfStageBucketStatsSchema.optional(),
  vectorHydrate: OpsPerfStageBucketStatsSchema.optional(),
  fullTextRecall: OpsPerfStageBucketStatsSchema.optional(),
  fullTextHydrate: OpsPerfStageBucketStatsSchema.optional(),
  rerank: OpsPerfStageBucketStatsSchema.optional(),
  postProcess: OpsPerfStageBucketStatsSchema.optional(),
  // 复合链路聚合直方图（基于成员阶段时间区间并集结算，不在阶段拆解表中单独展示）
  vectorPipeline: OpsPerfStageBucketStatsSchema.optional(),
  fullTextPipeline: OpsPerfStageBucketStatsSchema.optional(),
  dbPipeline: OpsPerfStageBucketStatsSchema.optional()
});
export type DatasetSearchBucketStages = z.infer<typeof DatasetSearchBucketStagesSchema>;

export const DatasetSearchEventStagesSchema = z
  .object({
    queryExtension: OpsPerfEventStageTimingSchema.optional().meta({
      description: '问题优化阶段耗时'
    }),
    imageCaption: OpsPerfEventStageTimingSchema.optional().meta({
      description: '图片描述生成阶段耗时'
    }),
    filter: OpsPerfEventStageTimingSchema.optional().meta({
      description: '集合权限与元数据过滤阶段耗时'
    }),
    embeddingApi: OpsPerfEventStageTimingSchema.optional().meta({
      description: '向量化接口调用阶段耗时'
    }),
    vectorRoute: OpsPerfEventStageTimingSchema.optional().meta({
      description: '向量索引路由快照准备阶段耗时'
    }),
    vectorLeaseWait: OpsPerfEventStageTimingSchema.optional().meta({
      description: '向量并发排队（Redis Lease）耗时'
    }),
    vectorRecall: OpsPerfEventStageTimingSchema.optional().meta({
      description: '向量库召回查询阶段耗时'
    }),
    vectorHydrate: OpsPerfEventStageTimingSchema.optional().meta({
      description: '向量结果 Mongo 回表阶段耗时'
    }),
    fullTextRecall: OpsPerfEventStageTimingSchema.optional().meta({
      description: '全文检索查询阶段耗时'
    }),
    fullTextHydrate: OpsPerfEventStageTimingSchema.optional().meta({
      description: '全文结果 Mongo 回表阶段耗时'
    }),
    rerank: OpsPerfEventStageTimingSchema.optional().meta({ description: '搜索结果重排阶段耗时' }),
    postProcess: OpsPerfEventStageTimingSchema.optional().meta({
      description: '融合去重、裁剪与装饰后处理阶段耗时'
    })
  })
  .meta({ description: '单次检索各执行阶段的相对起点与耗时明细' });
export type DatasetSearchEventStages = z.infer<typeof DatasetSearchEventStagesSchema>;

export const DatasetSearchMetricsSchema = z.object({
  rerankFallbackCount: z.number().nonnegative().optional(),
  pgHnswCount: z.number().nonnegative().optional(),
  pgExactCount: z.number().nonnegative().optional(),
  totalDatasetCount: z.number().nonnegative().optional(),
  totalResultCount: z.number().nonnegative().optional(),
  totalEmbeddingTokens: z.number().nonnegative().optional(),
  totalRerankTokens: z.number().nonnegative().optional(),
  /** 单刷盘窗口单点缓冲饱和时被保护性丢弃的异常/降级单点明细数（聚合桶统计仍完整计入）。 */
  droppedEventCount: z.number().nonnegative().optional()
});
export type DatasetSearchMetrics = z.infer<typeof DatasetSearchMetricsSchema>;

export const DatasetSearchEventDetailSchema = z
  .object({
    totalIndexCount: z
      .number()
      .nonnegative()
      .optional()
      .meta({ description: '覆盖知识库总向量索引行数', example: 150000 }),
    maxDatasetIndexCount: z
      .number()
      .nonnegative()
      .optional()
      .meta({ description: '单库最大向量索引行数', example: 120000 }),
    datasetCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: '参与本次检索的知识库数量', example: 2 }),
    queryCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: '检索词数量（含问题优化扩展）', example: 3 }),
    queryChars: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: '原始输入问题字符长度（脱敏）', example: 28 }),
    imageQueryCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: '图片查询数量', example: 0 }),
    hasMetadataFilter: z
      .boolean()
      .optional()
      .meta({ description: '是否启用元数据过滤', example: false }),
    hasPermissionFilter: z
      .boolean()
      .optional()
      .meta({ description: '是否应用集合权限过滤', example: true }),
    filterCollectionCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: '白名单过滤集合数', example: 12 }),
    forbidCollectionCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: '禁用过滤集合数', example: 0 }),
    candidateCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: '重排或阈值过滤前候选分块数', example: 60 }),
    resultCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: '最终返回命中分块数', example: 8 }),
    embeddingModel: z
      .string()
      .optional()
      .meta({ description: '向量化模型标识', example: 'text-embedding-3-small' }),
    rerankModel: z
      .string()
      .optional()
      .meta({ description: '重排模型标识', example: 'bge-reranker-v2-m3' }),
    extensionModel: z
      .string()
      .optional()
      .meta({ description: '问题优化模型标识', example: 'qwen-turbo' }),
    rerankFallback: z
      .boolean()
      .optional()
      .meta({ description: '本次检索是否发生重排降级', example: false }),
    synonymRerankTriggered: z
      .boolean()
      .optional()
      .meta({ description: '本次检索是否触发同义词次路重排', example: false }),
    pgUsesHnsw: z
      .boolean()
      .optional()
      .meta({ description: 'PG 向量查询是否命中 HNSW 索引', example: true }),
    pgMaxRows: z
      .number()
      .nonnegative()
      .optional()
      .meta({ description: 'PG HNSW 最大扫描元组数上限', example: 40000 }),
    hnswEfSearch: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: '本次 PG HNSW ef_search 参数值', example: 200 })
  })
  .meta({ description: '脱敏后的单次检索诊断上下文（不含用户查询或分块正文）' });
export type DatasetSearchEventDetail = z.infer<typeof DatasetSearchEventDetailSchema>;

/* ==================== Domain 2: dataset.rerank ==================== */

export const DatasetRerankDimsSchema = z.object({
  model: z.string(),
  hasSynonym: z.boolean()
});
export type DatasetRerankDims = z.infer<typeof DatasetRerankDimsSchema>;

export const DatasetRerankBucketStagesSchema = z.object({});
export type DatasetRerankBucketStages = z.infer<typeof DatasetRerankBucketStagesSchema>;

export const DatasetRerankMetricsSchema = z.object({
  fallbackCount: z.number().nonnegative().optional(),
  totalCandidates: z.number().nonnegative().optional(),
  totalInputTokens: z.number().nonnegative().optional()
});
export type DatasetRerankMetrics = z.infer<typeof DatasetRerankMetricsSchema>;

export const DatasetRerankEventStagesSchema = z.object({});

export const DatasetRerankEventDetailSchema = z.object({
  candidateCount: z.number().int().nonnegative().optional(),
  inputTokens: z.number().nonnegative().optional(),
  fallback: z.boolean().optional(),
  synonymGroups: z.number().int().nonnegative().optional()
});

/* ==================== Domain 3: dataset.queryExtension ==================== */

export const DatasetQueryExtensionDimsSchema = z.object({
  model: z.string()
});
export type DatasetQueryExtensionDims = z.infer<typeof DatasetQueryExtensionDimsSchema>;

export const DatasetQueryExtensionBucketStagesSchema = z.object({});
export type DatasetQueryExtensionBucketStages = z.infer<
  typeof DatasetQueryExtensionBucketStagesSchema
>;

export const DatasetQueryExtensionMetricsSchema = z.object({
  invalidJsonCount: z.number().nonnegative().optional(),
  totalInputTokens: z.number().nonnegative().optional(),
  totalOutputTokens: z.number().nonnegative().optional(),
  totalEmbeddingTokens: z.number().nonnegative().optional(),
  totalGeneratedQueries: z.number().nonnegative().optional()
});
export type DatasetQueryExtensionMetrics = z.infer<typeof DatasetQueryExtensionMetricsSchema>;

export const DatasetQueryExtensionEventStagesSchema = z.object({});

export const DatasetQueryExtensionEventDetailSchema = z.object({
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  embeddingTokens: z.number().nonnegative().optional(),
  generatedCount: z.number().int().nonnegative().optional(),
  invalidJson: z.boolean().optional()
});

/* ==================== Discriminated Unions ==================== */

const OpsPerfBucketBaseSchema = z.object({
  schemaVersion: z.number().int().default(1),
  granularity: z.enum(OpsPerfGranularityValues),
  bucketTime: z.date(),
  expireAt: z.date(),
  dimKey: z.string(),
  total: OpsPerfTotalStatsSchema
});

/** 小时聚合桶联合 Schema：按 domain 强类型收窄 dims / stages / metrics。 */
export const OpsPerfBucketSchema = z.discriminatedUnion('domain', [
  OpsPerfBucketBaseSchema.extend({
    domain: z.literal('dataset.search'),
    dims: DatasetSearchDimsSchema,
    stages: DatasetSearchBucketStagesSchema,
    metrics: DatasetSearchMetricsSchema
  }),
  OpsPerfBucketBaseSchema.extend({
    domain: z.literal('dataset.rerank'),
    dims: DatasetRerankDimsSchema,
    stages: DatasetRerankBucketStagesSchema,
    metrics: DatasetRerankMetricsSchema
  }),
  OpsPerfBucketBaseSchema.extend({
    domain: z.literal('dataset.queryExtension'),
    dims: DatasetQueryExtensionDimsSchema,
    stages: DatasetQueryExtensionBucketStagesSchema,
    metrics: DatasetQueryExtensionMetricsSchema
  })
]);
export type OpsPerfBucketType = z.infer<typeof OpsPerfBucketSchema>;

const OpsPerfEventBaseSchema = z.object({
  schemaVersion: z.number().int().default(1),
  createTime: z.date(),
  expireAt: z.date(),
  reason: z.enum(OpsPerfEventReasonValues),
  status: z.enum(OpsPerfEventStatusValues),
  errorCode: z.enum(OpsPerfErrorCodeValues).optional(),
  teamId: z.string().optional(),
  resourceIds: z.array(z.string()).default([]),
  totalMs: z.number().nonnegative()
});

/** 单点采样事件联合 Schema：按 domain 强类型收窄 dims / stages / detail。 */
export const OpsPerfEventSchema = z.discriminatedUnion('domain', [
  OpsPerfEventBaseSchema.extend({
    domain: z.literal('dataset.search'),
    dims: DatasetSearchDimsSchema,
    stages: DatasetSearchEventStagesSchema,
    detail: DatasetSearchEventDetailSchema
  }),
  OpsPerfEventBaseSchema.extend({
    domain: z.literal('dataset.rerank'),
    dims: DatasetRerankDimsSchema,
    stages: DatasetRerankEventStagesSchema,
    detail: DatasetRerankEventDetailSchema
  }),
  OpsPerfEventBaseSchema.extend({
    domain: z.literal('dataset.queryExtension'),
    dims: DatasetQueryExtensionDimsSchema,
    stages: DatasetQueryExtensionEventStagesSchema,
    detail: DatasetQueryExtensionEventDetailSchema
  })
]);
export type OpsPerfEventType = z.infer<typeof OpsPerfEventSchema>;

/** 按 domain 映射各领域维度、阶段与指标类型，供泛型埋点函数与聚合器复用。 */
export type OpsPerfDomainPayloadMap = {
  'dataset.search': {
    dims: DatasetSearchDims;
    stages: DatasetSearchEventStages;
    metrics: DatasetSearchMetrics;
    detail: DatasetSearchEventDetail;
  };
  'dataset.rerank': {
    dims: DatasetRerankDims;
    stages: z.infer<typeof DatasetRerankEventStagesSchema>;
    metrics: DatasetRerankMetrics;
    detail: z.infer<typeof DatasetRerankEventDetailSchema>;
  };
  'dataset.queryExtension': {
    dims: DatasetQueryExtensionDims;
    stages: z.infer<typeof DatasetQueryExtensionEventStagesSchema>;
    metrics: DatasetQueryExtensionMetrics;
    detail: z.infer<typeof DatasetQueryExtensionEventDetailSchema>;
  };
};
