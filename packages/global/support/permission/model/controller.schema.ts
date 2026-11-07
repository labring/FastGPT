import z from 'zod';
import { CollaboratorItemSchema, CollaboratorListSchema } from '../collaborator.schema';

/** 获取单个模型协作者列表的查询参数。 */
export const ModelCollaboratorListQuerySchema = z.object({
  modelId: z.string().meta({ description: '模型稳定 ID' })
});
export type ModelCollaboratorListQuery = z.infer<typeof ModelCollaboratorListQuerySchema>;

/** 批量获取模型协作者列表的请求体。 */
export const ModelCollaboratorBatchListBodySchema = z.object({
  modelIds: z.array(z.string()).min(1).meta({ description: '模型稳定 ID 列表' })
});
export type ModelCollaboratorBatchListBody = z.infer<typeof ModelCollaboratorBatchListBodySchema>;

export const ModelCollaboratorBatchListResponseSchema = z.record(
  z.string(),
  CollaboratorListSchema
);
export type ModelCollaboratorBatchListResponse = z.infer<
  typeof ModelCollaboratorBatchListResponseSchema
>;

/** 批量更新模型协作者权限的请求体。 */
export const ModelCollaboratorUpdateBodySchema = z.object({
  collaborators: z.array(CollaboratorItemSchema).meta({ description: '协作者权限列表' }),
  modelIds: z.array(z.string()).min(1).meta({ description: '模型稳定 ID 列表' })
});
export type ModelCollaboratorUpdateBody = z.infer<typeof ModelCollaboratorUpdateBodySchema>;
