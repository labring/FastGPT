import { ModelTypeEnum } from '../../../../core/ai/constants';
import {
  EmbeddingModelConfigSchema,
  LLMModelConfigSchema,
  ModelPriceTierSchema,
  RerankModelConfigSchema,
  STTModelConfigSchema,
  TTSModelConfigSchema
} from '../../../../core/ai/model.schema';
import { IntSchema } from '../../../../common/zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import z from 'zod';
import {
  CollaboratorItemSchema,
  CollaboratorListSchema
} from '../../../../support/permission/collaborator.schema';

const MyModelBaseSchema = z.object({
  modelId: z.string().meta({ description: '模型稳定 ID' }),
  model: z.string().meta({ description: 'Provider 请求使用的模型标识' }),
  name: z.string().meta({ description: '模型展示名称' }),
  provider: z.string().meta({ description: '模型提供商标识' }),
  isSystem: z.literal(true).meta({ description: '是否为系统模型' }),
  avatar: z.string().optional().meta({ description: '模型图标' }),
  isActive: z.boolean().optional().meta({ description: '模型是否启用' }),
  isCustom: z.boolean().meta({ description: '模型是否不在内置模板中' }),
  isDefault: z.boolean().optional().meta({ description: '是否为该类型默认模型' }),
  testMode: z.boolean().optional().meta({ description: '是否为测试模式' }),
  charsPointsPrice: z.number().optional().meta({ description: '按字符计费的积分单价' }),
  priceTiers: z.array(ModelPriceTierSchema).optional().meta({ description: '分段价格配置' }),
  inputPrice: z.number().optional().meta({ description: '旧版输入价格展示字段' }),
  outputPrice: z.number().optional().meta({ description: '旧版输出价格展示字段' })
});

export const MyLLMModelItemSchema = MyModelBaseSchema.extend({
  type: z.literal(ModelTypeEnum.llm),
  config: LLMModelConfigSchema.omit({
    defaultSystemChatPrompt: true,
    defaultConfig: true,
    fieldMap: true
  }),
  isDefaultDatasetTextModel: z.boolean().optional(),
  isDefaultDatasetImageModel: z.boolean().optional(),
  isDefaultChatTitleModel: z.boolean().optional()
});
export const MyEmbeddingModelItemSchema = MyModelBaseSchema.extend({
  type: z.literal(ModelTypeEnum.embedding),
  config: EmbeddingModelConfigSchema.omit({
    defaultConfig: true,
    dbConfig: true,
    queryConfig: true
  })
});
export const MyRerankModelItemSchema = MyModelBaseSchema.extend({
  type: z.literal(ModelTypeEnum.rerank),
  config: RerankModelConfigSchema.omit({ defaultConfig: true })
});
export const MyTTSModelItemSchema = MyModelBaseSchema.extend({
  type: z.literal(ModelTypeEnum.tts),
  config: TTSModelConfigSchema
});
export const MySTTModelItemSchema = MyModelBaseSchema.extend({
  type: z.literal(ModelTypeEnum.stt),
  config: STTModelConfigSchema
});

export const MyModelItemSchema = z.discriminatedUnion('type', [
  MyLLMModelItemSchema,
  MyEmbeddingModelItemSchema,
  MyRerankModelItemSchema,
  MyTTSModelItemSchema,
  MySTTModelItemSchema
]);
export type MyModelItemType = z.infer<typeof MyModelItemSchema>;
export type MyLLMModelItemType = z.infer<typeof MyLLMModelItemSchema>;
export type MyEmbeddingModelItemType = z.infer<typeof MyEmbeddingModelItemSchema>;
export type MyRerankModelItemType = z.infer<typeof MyRerankModelItemSchema>;
export type MyTTSModelItemType = z.infer<typeof MyTTSModelItemSchema>;
export type MySTTModelItemType = z.infer<typeof MySTTModelItemSchema>;

/* ============================================================================
 * API: 分页获取当前账号可用模型
 * Route: GET /api/core/ai/model/getMyModels
 * Method: GET
 * Description: 按类型和 Provider 分页获取当前团队成员有权使用的模型
 * Tags: ['AI 通用', 'Read']
 * ============================================================================ */

export const GetMyModelsQuerySchema = PaginationSchema.extend({
  pageSize: IntSchema.positive().max(100).optional().meta({ description: '每页模型数，最大 100' }),
  offset: IntSchema.optional().meta({ description: '分页偏移量' }),
  provider: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional().meta({ description: 'Provider 筛选；空字符串视为未筛选' })
  ),
  modelType: z.enum(ModelTypeEnum).optional().meta({ description: '模型类型筛选' })
});
export type GetMyModelsQuery = z.infer<typeof GetMyModelsQuerySchema>;

export const GetMyModelsResponseSchema = PaginationResponseSchema(MyModelItemSchema).extend({
  providers: z.array(z.string()).meta({ description: '当前模型类型下的全部可用 Provider' })
});
export type GetMyModelsResponse = z.infer<typeof GetMyModelsResponseSchema>;

/* ============================================================================
 * API: 获取当前账号可用的单个模型
 * Route: GET /api/core/ai/model/getMyModel
 * Method: GET
 * Description: 根据 modelId 恢复分页列表之外的当前选中模型
 * Tags: ['AI 通用', 'Read']
 * ============================================================================ */

export const GetMyModelQuerySchema = z.object({
  modelId: z.string().meta({ description: '模型稳定 ID' })
});
export type GetMyModelQuery = z.infer<typeof GetMyModelQuerySchema>;

export const GetMyModelResponseSchema = MyModelItemSchema;
export type GetMyModelResponse = z.infer<typeof GetMyModelResponseSchema>;

/* ============================================================================
 * API: 获取模型协作者
 * Route: GET /proApi/system/model/collaborator/list
 * Method: GET
 * Description: 获取指定模型的协作者权限配置
 * Tags: ['AI 通用', 'Read']
 * ============================================================================ */

export const ModelCollaboratorListQuerySchema = z.object({
  modelId: z.string().meta({ description: '模型稳定 ID' })
});
export type ModelCollaboratorListQuery = z.infer<typeof ModelCollaboratorListQuerySchema>;
export const ModelCollaboratorListResponseSchema = CollaboratorListSchema;

/* ============================================================================
 * API: 更新模型协作者
 * Route: POST /proApi/system/model/collaborator/update
 * Method: POST
 * Description: 批量更新指定模型的协作者权限配置
 * Tags: ['AI 通用', 'Write']
 * ============================================================================ */

export const ModelCollaboratorUpdateBodySchema = z.object({
  collaborators: z.array(CollaboratorItemSchema).meta({ description: '协作者权限列表' }),
  modelIds: z.array(z.string()).min(1).meta({ description: '模型稳定 ID 列表' })
});
export type ModelCollaboratorUpdateBody = z.infer<typeof ModelCollaboratorUpdateBodySchema>;
