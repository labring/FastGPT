import z from 'zod';
import {
  DatasetIndexScaleValues,
  DatasetSearchModeFilterValues,
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

/** 单点记录中单个阶段的相对起点与耗时（支持瀑布图精准呈现串/并行关系）。 */
export const OpsPerfEventStageTimingSchema = z.object({
  offsetMs: z.number().nonnegative(),
  ms: z.number().nonnegative(),
  callCount: z.number().int().positive().optional(),
  errorCount: z.number().int().nonnegative().optional()
});
export type OpsPerfEventStageTiming = z.infer<typeof OpsPerfEventStageTimingSchema>;

/* ==================== Domain 1: dataset.search ==================== */

export const DatasetSearchDimsSchema = z.object({
  searchMode: z.enum(DatasetSearchModeFilterValues).catch('unknown'),
  indexScale: z.enum(DatasetIndexScaleValues).catch('unknown'),
  usingReRank: z.boolean(),
  usingExtension: z.boolean(),
  vectorEngine: z.enum(VectorEngineMetricValues).catch('unknown')
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
  // 复合链路聚合直方图（仅用于桶内端到端分位数估算，不在阶段拆解表中单独展示）
  vectorPipeline: OpsPerfStageBucketStatsSchema.optional(),
  fullTextPipeline: OpsPerfStageBucketStatsSchema.optional()
});
export type DatasetSearchBucketStages = z.infer<typeof DatasetSearchBucketStagesSchema>;

export const DatasetSearchEventStagesSchema = z.object({
  queryExtension: OpsPerfEventStageTimingSchema.optional(),
  imageCaption: OpsPerfEventStageTimingSchema.optional(),
  filter: OpsPerfEventStageTimingSchema.optional(),
  embeddingApi: OpsPerfEventStageTimingSchema.optional(),
  vectorRoute: OpsPerfEventStageTimingSchema.optional(),
  vectorLeaseWait: OpsPerfEventStageTimingSchema.optional(),
  vectorRecall: OpsPerfEventStageTimingSchema.optional(),
  vectorHydrate: OpsPerfEventStageTimingSchema.optional(),
  fullTextRecall: OpsPerfEventStageTimingSchema.optional(),
  fullTextHydrate: OpsPerfEventStageTimingSchema.optional(),
  rerank: OpsPerfEventStageTimingSchema.optional(),
  postProcess: OpsPerfEventStageTimingSchema.optional()
});
export type DatasetSearchEventStages = z.infer<typeof DatasetSearchEventStagesSchema>;

export const DatasetSearchMetricsSchema = z.object({
  rerankFallbackCount: z.number().nonnegative().optional(),
  pgHnswCount: z.number().nonnegative().optional(),
  pgExactCount: z.number().nonnegative().optional(),
  totalDatasetCount: z.number().nonnegative().optional(),
  totalResultCount: z.number().nonnegative().optional(),
  totalEmbeddingTokens: z.number().nonnegative().optional(),
  totalRerankTokens: z.number().nonnegative().optional()
});
export type DatasetSearchMetrics = z.infer<typeof DatasetSearchMetricsSchema>;

export const DatasetSearchEventDetailSchema = z.object({
  totalIndexCount: z.number().nonnegative().optional(),
  maxDatasetIndexCount: z.number().nonnegative().optional(),
  datasetCount: z.number().int().nonnegative().optional(),
  queryCount: z.number().int().nonnegative().optional(),
  queryChars: z.number().int().nonnegative().optional(),
  imageQueryCount: z.number().int().nonnegative().optional(),
  hasMetadataFilter: z.boolean().optional(),
  hasPermissionFilter: z.boolean().optional(),
  filterCollectionCount: z.number().int().nonnegative().optional(),
  forbidCollectionCount: z.number().int().nonnegative().optional(),
  candidateCount: z.number().int().nonnegative().optional(),
  resultCount: z.number().int().nonnegative().optional(),
  embeddingModel: z.string().optional(),
  rerankModel: z.string().optional(),
  extensionModel: z.string().optional(),
  rerankFallback: z.boolean().optional(),
  synonymRerankTriggered: z.boolean().optional(),
  pgUsesHnsw: z.boolean().optional(),
  pgMaxRows: z.number().nonnegative().optional(),
  hnswEfSearch: z.number().int().nonnegative().optional()
});
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
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
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
