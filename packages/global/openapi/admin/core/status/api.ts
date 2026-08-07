import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';

export const TrainingRecordStateEnumSchema = z.enum([
  'queued',
  'processing',
  'retrying',
  'final_error',
  'blocked',
  'exhausted_without_error'
]);
export type TrainingRecordState = z.infer<typeof TrainingRecordStateEnumSchema>;

export const TrainingRecordStateFilterEnumSchema = z.enum(['queued', 'processing', 'error']);
export type TrainingRecordStateFilter = z.infer<typeof TrainingRecordStateFilterEnumSchema>;

export const TrainingRecordActionEnumSchema = z.enum(['retry', 'delete']);
export type TrainingRecordAction = z.infer<typeof TrainingRecordActionEnumSchema>;

export const TrainingTaskSummarySchema = z.object({
  mode: z.literal('chunk').meta({ description: '固定为 Chunk 向量训练' }),
  queued: z.number().meta({ description: '排队任务数' }),
  processing: z.number().meta({ description: '处理中任务数' }),
  retrying: z.number().meta({ description: '自动重试任务数' }),
  finalError: z.number().meta({ description: '最终失败任务数' }),
  blocked: z.number().meta({ description: '永久阻塞任务数' }),
  exhaustedWithoutError: z.number().meta({ description: '无错误但重试耗尽任务数' }),
  total: z.number().meta({ description: '当前训练任务总数' }),
  completed: z.number().meta({ description: '已完成 Chunk 数量' }),
  severity: z.enum(['normal', 'warning', 'severe']).meta({ description: '运维告警等级' })
});
export type TrainingTaskSummaryType = z.infer<typeof TrainingTaskSummarySchema>;

export const GetTrainingTaskListResponseSchema = TrainingTaskSummarySchema;
export type GetTrainingTaskListResponseType = z.infer<typeof GetTrainingTaskListResponseSchema>;

export const GetTrainingRecordListBodySchema = PaginationSchema.extend({
  search: z.string().trim().min(1).optional().meta({ description: '训练 ID、知识库或团队名称' }),
  state: TrainingRecordStateFilterEnumSchema.optional().meta({ description: '训练状态筛选' })
});
export type GetTrainingRecordListBody = z.infer<typeof GetTrainingRecordListBodySchema>;

export const TrainingRecordSchema = z.object({
  id: ObjectIdSchema.meta({ description: '训练任务 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '知识库 ID' }),
  collectionId: ObjectIdSchema.meta({ description: '集合 ID' }),
  datasetName: z.string().meta({ description: '知识库名称' }),
  collectionName: z.string().optional().meta({ description: '集合名称' }),
  teamName: z.string().optional().meta({ description: '团队名称' }),
  model: z.string().optional().meta({ description: 'Embedding 模型' }),
  chunkIndex: z.number().optional().meta({ description: '分块序号' }),
  dataId: ObjectIdSchema.optional().meta({ description: '重建关联的数据 ID' }),
  q: z.string().optional().meta({ description: '分块主文本' }),
  a: z.string().optional().meta({ description: '分块补充文本' }),
  retryCount: z.number().meta({ description: '剩余重试次数' }),
  state: TrainingRecordStateEnumSchema.meta({ description: '训练状态' }),
  actions: z
    .array(TrainingRecordActionEnumSchema)
    .meta({ description: '当前状态允许的管理员操作' }),
  error: z.string().optional().meta({ description: '最近错误信息' }),
  lockTime: z.string().optional().meta({ description: '任务租约时间' })
});
export type TrainingRecordType = z.infer<typeof TrainingRecordSchema>;

export const GetTrainingRecordListResponseSchema = PaginationResponseSchema(TrainingRecordSchema);
export type GetTrainingRecordListResponseType = z.infer<typeof GetTrainingRecordListResponseSchema>;

export const TrainingActionBodySchema = z.object({
  id: ObjectIdSchema.meta({ description: '训练任务 ID' }),
  action: z.enum(['retry', 'delete']).meta({ description: '管理员操作' })
});
export type TrainingActionBody = z.infer<typeof TrainingActionBodySchema>;

export const TrainingActionResponseSchema = z.object({
  affectedCount: z.number().meta({ description: '实际影响的任务数量' })
});
export type TrainingActionResponseType = z.infer<typeof TrainingActionResponseSchema>;

export const StatusOverviewAlertSchema = z.object({
  level: z.literal('warning').meta({ description: '告警等级' }),
  title: z.string().meta({ description: '告警标题' }),
  description: z.string().meta({ description: '告警描述' }),
  source: z.string().meta({ description: '告警来源' }),
  scope: z.string().meta({ description: '告警范围' }),
  count: z.number().meta({ description: '异常数量' })
});
export type StatusOverviewAlertType = z.infer<typeof StatusOverviewAlertSchema>;

export const GetStatusOverviewResponseSchema = z.object({
  unresolvedCount: z.number().meta({ description: '未恢复告警数' }),
  alerts: z.array(StatusOverviewAlertSchema).meta({ description: '告警消息列表' })
});
export type GetStatusOverviewResponseType = z.infer<typeof GetStatusOverviewResponseSchema>;
