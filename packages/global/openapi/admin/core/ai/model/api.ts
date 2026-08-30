import {
  EmbeddingSystemModelDocumentSchema,
  EmbeddingModelConfigSchema,
  LLMSystemModelDocumentSchema,
  LLMModelConfigSchema,
  RerankSystemModelDocumentSchema,
  RerankModelConfigSchema,
  STTSystemModelDocumentSchema,
  STTModelConfigSchema,
  SystemModelDataSchema,
  SystemModelDocumentDataSchema,
  TTSModelConfigSchema,
  TTSSystemModelDocumentSchema
} from '../../../../../core/ai/model.schema';
import { ModelScopeEnum, ModelTypeEnum } from '../../../../../core/ai/constants';
import { IntSchema } from '../../../../../common/zod';
import z from 'zod';
import { ModelProviderSchema } from '../../../../core/ai/model/api';
import { ModelDefaultIdsSchema } from '../../../../../core/ai/defaultModel';

const ModelIdSchema = z.string().trim().min(1).meta({
  example: '68ad85a7463006c963799a05',
  description: '模型稳定 ID 字符串'
});

export const AdminSystemModelReferenceSchema = z.object({
  modelId: ModelIdSchema
});
export type AdminSystemModelReference = z.infer<typeof AdminSystemModelReferenceSchema>;

/* ============================================================================
 * API: 获取管理员系统模型列表
 * Route: GET /api/admin/settings/model/list
 * Method: GET
 * Description: 获取全部系统作用域模型
 * Tags: ['管理员系统配置', 'Read']
 * ============================================================================ */

export const GetAdminSystemModelListResponseSchema = z.object({
  models: z.array(SystemModelDataSchema),
  providers: z.array(ModelProviderSchema),
  defaultModelIds: ModelDefaultIdsSchema,
  aiproxyChannels: z.array(
    z.object({
      channelId: z.number(),
      name: z.object({ en: z.string(), 'zh-CN': z.string(), 'zh-Hant': z.string() }),
      avatar: z.string()
    })
  )
});
export type GetAdminSystemModelListResponse = z.infer<typeof GetAdminSystemModelListResponseSchema>;

/* ============================================================================
 * API: 获取管理员系统模型详情
 * Route: GET /api/admin/settings/model/detail
 * Method: GET
 * Description: 按 modelId 获取系统模型详情
 * Tags: ['管理员系统配置', 'Read']
 * ============================================================================ */

export const GetAdminSystemModelDetailResponseSchema = SystemModelDataSchema;
export type GetAdminSystemModelDetailResponse = z.infer<
  typeof GetAdminSystemModelDetailResponseSchema
>;

/* ============================================================================
 * API: 获取系统模型模板默认配置
 * Route: GET /api/admin/settings/model/getDefaultConfig
 * Method: GET
 * Description: 按 modelId 获取插件模板中的默认配置
 * Tags: ['管理员系统配置', 'Read']
 * ============================================================================ */

export const GetAdminSystemModelDefaultConfigResponseSchema = SystemModelDocumentDataSchema;
export type GetAdminSystemModelDefaultConfigResponse = z.infer<
  typeof GetAdminSystemModelDefaultConfigResponseSchema
>;

/* ============================================================================
 * API: 测试系统模型配置
 * Route: GET /api/admin/settings/model/test
 * Method: GET
 * Description: 按 modelId 测试系统模型调用
 * Tags: ['管理员系统配置', 'Read']
 * ============================================================================ */

export const TestAdminSystemModelQuerySchema = AdminSystemModelReferenceSchema.extend({
  channelId: IntSchema.positive().optional().meta({
    example: 1,
    description: '可选的 AI Proxy 渠道 ID'
  })
});
export type TestAdminSystemModelQuery = z.infer<typeof TestAdminSystemModelQuerySchema>;
export const TestAdminSystemModelResponseSchema = z.unknown();
export type TestAdminSystemModelResponse = z.infer<typeof TestAdminSystemModelResponseSchema>;

/* ============================================================================
 * API: 创建自定义系统模型
 * Route: POST /api/admin/settings/model/create
 * Method: POST
 * Description: 按最新持久化结构创建自定义系统模型
 * Tags: ['管理员系统配置', 'Write']
 * ============================================================================ */

export const CreateSystemModelBodySchema = z.object({
  modelData: SystemModelDocumentDataSchema.meta({ description: '完整的系统模型配置' })
});
export type CreateSystemModelBody = z.infer<typeof CreateSystemModelBodySchema>;
export const CreateSystemModelResponseSchema = z.object({
  modelId: ModelIdSchema
});
export type CreateSystemModelResponse = z.infer<typeof CreateSystemModelResponseSchema>;

/* ============================================================================
 * API: 更新系统模型配置
 * Route: PUT /api/admin/settings/model/update
 * Method: PUT
 * Description: 只按 modelId 更新已有系统模型，不执行 upsert 或历史结构修复
 * Tags: ['管理员系统配置', 'Write']
 * ============================================================================ */

export const UpdateSystemModelBodySchema = z.object({
  modelId: ModelIdSchema,
  modelData: SystemModelDocumentDataSchema.meta({ description: '完整的系统模型配置' })
});
export type UpdateSystemModelBody = z.infer<typeof UpdateSystemModelBodySchema>;

const ImportedModelIdField = {
  modelId: ModelIdSchema,
  scope: z.literal(ModelScopeEnum.system).meta({ description: '系统模型作用域' })
};

export const ImportedSystemModelSchema = z.discriminatedUnion('type', [
  LLMSystemModelDocumentSchema.extend({
    ...ImportedModelIdField,
    config: LLMModelConfigSchema
  }),
  EmbeddingSystemModelDocumentSchema.extend({
    ...ImportedModelIdField,
    config: EmbeddingModelConfigSchema
  }),
  TTSSystemModelDocumentSchema.extend({
    ...ImportedModelIdField,
    config: TTSModelConfigSchema
  }),
  STTSystemModelDocumentSchema.extend({
    ...ImportedModelIdField,
    config: STTModelConfigSchema
  }),
  RerankSystemModelDocumentSchema.extend({
    ...ImportedModelIdField,
    config: RerankModelConfigSchema
  })
]);
export type ImportedSystemModel = z.infer<typeof ImportedSystemModelSchema>;

const ImportedSystemModelRecordListSchema = z.array(z.record(z.string(), z.unknown()));
const JsonSystemModelListSchema = z.string().transform((value, ctx) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    ctx.addIssue({ code: 'custom', message: 'config must be valid JSON' });
    return z.NEVER;
  }
});

/* ============================================================================
 * API: 导入系统模型配置
 * Route: PUT /api/admin/settings/model/updateWithJson
 * Method: PUT
 * Description: 忽略无 modelId 的旧记录，按 modelId 更新或按 model 创建外部实例记录
 * Tags: ['管理员系统配置', 'Write']
 * ============================================================================ */

export const UpdateSystemModelsWithJsonBodySchema = z.object({
  config: JsonSystemModelListSchema.pipe(ImportedSystemModelRecordListSchema).meta({
    example:
      '[{"modelId":"68ad85a7463006c963799a05","scope":"system","type":"llm","provider":"OpenAI","model":"gpt-5","name":"GPT-5","isActive":true,"config":{"maxContext":400000,"maxResponse":128000,"quoteMaxToken":300000,"toolChoice":true}}]',
    description: '最新系统模型配置 JSON；无 modelId 的旧记录会被忽略'
  })
});
export type UpdateSystemModelsWithJsonBody = z.input<typeof UpdateSystemModelsWithJsonBodySchema>;
export type ParsedSystemModelsWithJsonBody = z.output<typeof UpdateSystemModelsWithJsonBodySchema>;

/* ============================================================================
 * API: 导出系统模型配置
 * Route: GET /api/admin/settings/model/getConfigJson
 * Method: GET
 * Description: 导出包含 modelId 的最新系统模型配置 JSON
 * Tags: ['管理员系统配置', 'Read']
 * ============================================================================ */

export const GetSystemModelConfigJsonResponseSchema = z.string().meta({
  description: '最新系统模型配置 JSON 字符串'
});
export type GetSystemModelConfigJsonResponse = z.infer<
  typeof GetSystemModelConfigJsonResponseSchema
>;

/* ============================================================================
 * API: 更新系统默认模型
 * Route: PUT /api/admin/settings/model/updateDefault
 * Method: PUT
 * Description: 按 string modelId 更新各类型及系统用途的默认模型
 * Tags: ['管理员系统配置', 'Write']
 * ============================================================================ */

export const UpdateDefaultModelsBodySchema = z.object({
  [ModelTypeEnum.llm]: ModelIdSchema.optional(),
  [ModelTypeEnum.embedding]: ModelIdSchema.optional(),
  [ModelTypeEnum.tts]: ModelIdSchema.optional(),
  [ModelTypeEnum.stt]: ModelIdSchema.optional(),
  [ModelTypeEnum.rerank]: ModelIdSchema.optional(),
  datasetTextLLMModelId: ModelIdSchema.optional(),
  datasetImageLLMModelId: ModelIdSchema.optional(),
  chatTitleLLMModelId: ModelIdSchema.optional()
});
export type UpdateDefaultModelsBody = z.infer<typeof UpdateDefaultModelsBodySchema>;
