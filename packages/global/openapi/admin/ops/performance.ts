import z from 'zod';
import { IntSchema } from '../../../common/zod';
import {
  DatasetIndexScaleValues,
  DatasetSearchModeFilterValues,
  OPS_PERF_EVENT_RETENTION_DAYS,
  OpsPerfErrorCodeValues,
  OpsPerfEventReasonValues,
  OpsPerfEventStatusValues,
  VectorEngineMetricValues
} from '../../../common/opsPerf/constants';
import {
  DatasetSearchDimsSchema,
  DatasetSearchEventDetailSchema,
  DatasetSearchEventStagesSchema
} from '../../../common/opsPerf/type';

/* ==================== 1. 知识库搜索性能总览接口 ==================== */

export const GetDatasetSearchPerfQuerySchema = z.object({
  rangeHours: IntSchema.min(1)
    .max(24 * 90)
    .default(24)
    .meta({
      description: '查询时间范围（小时），默认 24 小时，常用 24 / 168(7天) / 720(30天)',
      example: 24
    }),
  searchMode: z
    .enum(DatasetSearchModeFilterValues)
    .optional()
    .meta({ description: '可选：按检索模式筛选' }),
  indexScale: z
    .enum(DatasetIndexScaleValues)
    .optional()
    .meta({ description: '可选：按知识库索引规模分桶筛选' })
});
export type GetDatasetSearchPerfQuery = z.infer<typeof GetDatasetSearchPerfQuerySchema>;

export const DatasetSearchPerfTrendPointSchema = z.object({
  bucketTime: z.string().meta({ description: '时间桶 ISO 字符串（小时或天对齐）' }),
  count: z.number().nonnegative().meta({ description: '总检索次数' }),
  errorCount: z.number().nonnegative().meta({ description: '失败次数' }),
  avgMs: z.number().nonnegative().meta({ description: '平均耗时 (ms)' }),
  p50Ms: z.number().nonnegative().meta({ description: 'P50 耗时 (ms)' }),
  p95Ms: z.number().nonnegative().meta({ description: 'P95 耗时 (ms)' }),
  p99Ms: z.number().nonnegative().meta({ description: 'P99 耗时 (ms)' })
});
export type DatasetSearchPerfTrendPoint = z.infer<typeof DatasetSearchPerfTrendPointSchema>;

export const DatasetSearchIndexScaleStatSchema = z.object({
  scale: z.enum(DatasetIndexScaleValues).meta({ description: '索引规模分桶标识' }),
  count: z.number().nonnegative().meta({ description: '该规模检索次数' }),
  ratio: z.number().min(0).max(1).meta({ description: '调用占比 (0~1)' }),
  avgMs: z.number().nonnegative().meta({ description: '平均耗时 (ms)' }),
  p50Ms: z.number().nonnegative().meta({ description: 'P50 耗时 (ms)' }),
  p95Ms: z.number().nonnegative().meta({ description: 'P95 耗时 (ms)' }),
  p99Ms: z.number().nonnegative().meta({ description: 'P99 耗时 (ms)' }),
  errorRate: z.number().min(0).max(1).meta({ description: '失败率 (0~1)' }),
  pgHnswRate: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .meta({ description: 'PG HNSW 命中率，无 PG 路由样本时为 null' })
});
export type DatasetSearchIndexScaleStat = z.infer<typeof DatasetSearchIndexScaleStatSchema>;

export const DatasetSearchStageStatSchema = z.object({
  key: z.string().meta({ description: '阶段唯一标识' }),
  step: z.string().meta({ description: '执行步骤编号，如 1 / 3A-1 / 3B-1' }),
  group: z
    .enum(['serial', 'parallel-vector', 'parallel-fulltext'])
    .meta({ description: '串行或并行分支分组' }),
  triggerCount: z.number().nonnegative().meta({ description: '触发次数' }),
  triggerRate: z.number().min(0).max(1).meta({ description: '触发率（触发次数 / 总检索数）' }),
  avgMs: z.number().nonnegative().meta({ description: '触发时平均耗时 (ms)' }),
  p95Ms: z.number().nonnegative().meta({ description: '触发时 P95 耗时 (ms)' }),
  maxMs: z.number().nonnegative().meta({ description: '最大耗时 (ms)' }),
  errorCount: z.number().nonnegative().meta({ description: '阶段报错或降级次数' }),
  globalContributionMs: z
    .number()
    .nonnegative()
    .meta({ description: '折算全站单次检索均耗贡献 (= 触发率 × 均值)' })
});
export type DatasetSearchStageStat = z.infer<typeof DatasetSearchStageStatSchema>;

export const RerankModelPerfStatSchema = z.object({
  model: z.string().meta({ description: 'Rerank 模型标识' }),
  count: z.number().nonnegative().meta({ description: '调用次数' }),
  avgMs: z.number().nonnegative().meta({ description: '平均耗时 (ms)' }),
  p50Ms: z.number().nonnegative().meta({ description: 'P50 耗时 (ms)' }),
  p95Ms: z.number().nonnegative().meta({ description: 'P95 耗时 (ms)' }),
  avgCandidates: z.number().nonnegative().meta({ description: '平均候选分块数' }),
  synonymRatio: z.number().min(0).max(1).meta({ description: '触发同义词双路重排占比' }),
  fallbackRate: z.number().min(0).max(1).meta({ description: '降级/失败占比' })
});
export type RerankModelPerfStat = z.infer<typeof RerankModelPerfStatSchema>;

export const QueryExtensionModelPerfStatSchema = z.object({
  model: z.string().meta({ description: '问题优化 LLM 模型标识' }),
  count: z.number().nonnegative().meta({ description: '调用次数' }),
  avgMs: z.number().nonnegative().meta({ description: '总平均耗时 (ms)' }),
  p50Ms: z.number().nonnegative().meta({ description: 'P50 耗时 (ms)' }),
  p95Ms: z.number().nonnegative().meta({ description: 'P95 耗时 (ms)' }),
  failRate: z.number().min(0).max(1).meta({ description: '异常或 JSON 解析降级占比' })
});
export type QueryExtensionModelPerfStat = z.infer<typeof QueryExtensionModelPerfStatSchema>;

export const RetrievalEnginePerfSummarySchema = z.object({
  count: z.number().nonnegative().meta({ description: '触发次数' }),
  triggerRate: z.number().min(0).max(1).meta({ description: '触发率 (0~1)' }),
  avgMs: z.number().nonnegative().meta({ description: '平均耗时 (ms)' }),
  p50Ms: z.number().nonnegative().meta({ description: 'P50 耗时 (ms)' }),
  p95Ms: z.number().nonnegative().meta({ description: 'P95 耗时 (ms)' }),
  p99Ms: z.number().nonnegative().meta({ description: 'P99 耗时 (ms)' })
});
export type RetrievalEnginePerfSummary = z.infer<typeof RetrievalEnginePerfSummarySchema>;

export const GetDatasetSearchPerfResponseSchema = z.object({
  meta: z.object({
    vectorEngine: z.enum(VectorEngineMetricValues).meta({ description: '当前实例向量库引擎' }),
    fullTextEngine: z.enum(['milvus', 'mongo']).meta({ description: '当前实例全文检索引擎' }),
    bucketGranularity: z.enum(['hour', 'day']).meta({ description: '趋势图展示聚合粒度' }),
    eventRetentionDays: z.number().int().positive().default(OPS_PERF_EVENT_RETENTION_DAYS).meta({
      description: '单点排查样本 TTL 保留天数（明细列表与缺口计数均受此窗口截断）',
      example: OPS_PERF_EVENT_RETENTION_DAYS
    }),
    eventWindowClamped: z.boolean().default(false).meta({
      description: '当前筛选时间范围是否超出单点样本保留期（为 true 时明细及缺口按近保留期截断）',
      example: false
    })
  }),
  summary: z.object({
    totalCount: z.number().nonnegative().meta({ description: '时间范围内总检索次数' }),
    avgMs: z.number().nonnegative().meta({ description: '平均耗时 (ms)' }),
    p50Ms: z.number().nonnegative().meta({ description: 'P50 耗时 (ms)' }),
    p95Ms: z.number().nonnegative().meta({ description: 'P95 耗时 (ms)' }),
    p99Ms: z.number().nonnegative().meta({ description: 'P99 耗时 (ms)' }),
    dbAvgMs: z.number().nonnegative().meta({
      description: '数据库平均耗时（过滤 + 向量 + 全文 + 回表的时间区间并集均值）(ms)',
      example: 145
    }),
    errorCount: z.number().nonnegative().meta({ description: '失败次数' }),
    errorRate: z.number().min(0).max(1).meta({ description: '失败率' }),
    droppedEventCount: z.number().int().nonnegative().default(0).meta({
      description:
        '与单点明细同一时间窗（UTC 整点对齐且受 7 天单点保留期截断）内，因单点有界缓冲饱和被省略的异常/降级明细条数（聚合统计不受影响）',
      example: 0
    }),
    rerankTriggerRate: z.number().min(0).max(1).meta({ description: 'Rerank 触发率' }),
    rerankAvgMs: z.number().nonnegative().meta({ description: 'Rerank 平均耗时 (ms)' }),
    rerankP95Ms: z.number().nonnegative().meta({ description: 'Rerank P95 耗时 (ms)' }),
    rerankFallbackRate: z.number().min(0).max(1).meta({ description: 'Rerank 降级/失败率' }),
    queryExtTriggerRate: z.number().min(0).max(1).meta({ description: '问题优化触发率' }),
    queryExtAvgMs: z.number().nonnegative().meta({ description: '问题优化平均耗时 (ms)' }),
    queryExtP95Ms: z.number().nonnegative().meta({ description: '问题优化 P95 耗时 (ms)' }),
    queryExtFailRate: z.number().min(0).max(1).meta({ description: '问题优化失败/解析降级率' })
  }),
  trend: z.array(DatasetSearchPerfTrendPointSchema),
  indexScaleStats: z.array(DatasetSearchIndexScaleStatSchema),
  vectorSearchPerf: RetrievalEnginePerfSummarySchema,
  fullTextSearchPerf: RetrievalEnginePerfSummarySchema,
  stageStats: z.array(DatasetSearchStageStatSchema),
  rerankByModel: z.array(RerankModelPerfStatSchema),
  queryExtensionByModel: z.array(QueryExtensionModelPerfStatSchema)
});
export type GetDatasetSearchPerfResponse = z.infer<typeof GetDatasetSearchPerfResponseSchema>;

/* ==================== 2. 知识库搜索单点明细列表接口 ==================== */

export const GetDatasetSearchPerfEventsQuerySchema = z.object({
  rangeHours: IntSchema.min(1)
    .max(24 * 90)
    .default(24)
    .meta({
      description: '查询时间范围（小时，按 UTC 整点与总览对齐，并受单点 7 天保留期截断）',
      example: 24
    }),
  pageNum: IntSchema.min(1).default(1).meta({ description: '页码（1 起步）', example: 1 }),
  pageSize: IntSchema.min(1).max(100).default(20).meta({ description: '每页条数', example: 20 }),
  reason: z
    .enum(OpsPerfEventReasonValues)
    .optional()
    .meta({ description: '按留痕类型筛选：error/degraded/sample' }),
  searchMode: z
    .enum(DatasetSearchModeFilterValues)
    .optional()
    .meta({ description: '按检索模式筛选' }),
  indexScale: z
    .enum(DatasetIndexScaleValues)
    .optional()
    .meta({ description: '按索引规模分桶筛选' }),
  datasetId: z.string().trim().optional().meta({ description: '按知识库 ID 精确筛选' })
});
export type GetDatasetSearchPerfEventsQuery = z.infer<typeof GetDatasetSearchPerfEventsQuerySchema>;

export const DatasetSearchPerfEventItemSchema = z.object({
  id: z.string().meta({ description: '单点事件 ID', example: '67c526a0ddd9a98bde65ad7e' }),
  createTime: z.string().meta({
    description: '检索发生时间 ISO 字符串',
    example: '2026-11-23T08:30:00.000Z'
  }),
  reason: z.enum(OpsPerfEventReasonValues).meta({
    description:
      '单点样本保留原因（error/degraded 在单刷盘窗口有界缓冲内优先留痕，突发溢出计入 summary.droppedEventCount；sample 为正常低比例采样）',
    example: 'degraded'
  }),
  status: z.enum(OpsPerfEventStatusValues).meta({
    description: '单次检索执行结果状态（ok=正常完成，degraded=发生静默降级，error=主链路异常）',
    example: 'degraded'
  }),
  errorCode: z.enum(OpsPerfErrorCodeValues).optional().meta({
    description: '脱敏白名单错误码（不记录上游原始异常文本）',
    example: 'RERANK_FALLBACK'
  }),
  resourceIds: z.array(z.string()).meta({
    description: '本次检索涉及的知识库 ID 列表',
    example: ['67c526a0ddd9a98bde65ad7f']
  }),
  datasets: z
    .array(
      z.object({
        id: z.string().meta({ description: '知识库 ID', example: '67c526a0ddd9a98bde65ad7f' }),
        name: z
          .string()
          .optional()
          .meta({ description: '知识库名称（已删除时缺省）', example: '产品架构文档库' })
      })
    )
    .default([])
    .meta({ description: '回查名称后的知识库列表（按检索顺序排列）' }),
  totalMs: z
    .number()
    .nonnegative()
    .meta({ description: '本次检索端到端总耗时 (ms)', example: 486.5 }),
  dims: DatasetSearchDimsSchema,
  stages: DatasetSearchEventStagesSchema,
  detail: DatasetSearchEventDetailSchema
});
export type DatasetSearchPerfEventItem = z.infer<typeof DatasetSearchPerfEventItemSchema>;

export const GetDatasetSearchPerfEventsResponseSchema = z.object({
  total: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '符合筛选条件的单点事件总数', example: 42 }),
  list: z.array(DatasetSearchPerfEventItemSchema).meta({ description: '当前页单点排查记录列表' })
});
export type GetDatasetSearchPerfEventsResponse = z.infer<
  typeof GetDatasetSearchPerfEventsResponseSchema
>;
