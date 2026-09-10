import { ModelScopeEnum, ModelTypeEnum } from '../../../../core/ai/constants';
import {
  EmbeddingModelConfigSchema,
  LLMModelConfigSchema,
  ModelPriceTierSchema,
  RerankModelConfigSchema,
  STTModelConfigSchema,
  TTSModelConfigSchema
} from '../../../../core/ai/model.schema';
import z from 'zod';
import {
  CollaboratorItemSchema,
  CollaboratorListSchema
} from '../../../../support/permission/collaborator.schema';
import { ModelDefaultIdsSchema } from '../../../../core/ai/defaultModel';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';

const MyModelBaseSchema = z.object({
  modelId: z.string().meta({ description: '模型稳定 ID' }),
  model: z.string().meta({ description: 'Provider 请求使用的模型标识' }),
  name: z.string().meta({ description: '模型展示名称' }),
  provider: z.string().meta({ description: '模型提供商标识' }),
  scope: z.literal(ModelScopeEnum.system).meta({ description: '模型实例作用域' }),
  avatar: z.string().optional().meta({ description: '模型图标' }),
  isActive: z.boolean().optional().meta({ description: '模型是否启用' }),
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
  })
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

export const ModelProviderSchema = z.object({
  provider: z.string().meta({ description: '模型提供商标识' }),
  value: z.object({
    en: z.string(),
    'zh-CN': z.string(),
    'zh-Hant': z.string()
  }),
  avatar: z.string().meta({ description: '模型提供商图标' })
});

/* ============================================================================
 * API: 获取当前成员模型目录
 * Route: GET /api/core/ai/model/catalog
 * Method: GET
 * Description: 通过登录态或外链身份返回对应成员完整可用模型、Provider 与有效默认模型 ID；版本一致时省略数据
 * Tags: ['AI 通用', 'Read']
 * ============================================================================ */

export const GetModelCatalogQuerySchema = z.object({
  version: z.string().trim().min(1).optional().meta({ description: '客户端已有目录版本' }),
  outLinkAuthData: OutLinkChatAuthSchema.optional().meta({
    example: JSON.stringify({ shareId: 'share-id', outLinkUid: 'out-link-user-id' }),
    description: '分享链接鉴权数据；存在时使用发布链接绑定的成员身份计算模型权限'
  })
});
export type GetModelCatalogQuery = z.infer<typeof GetModelCatalogQuerySchema>;

export const GetModelCatalogResponseSchema = z.object({
  version: z.string().meta({ description: '当前成员模型目录内容版本' }),
  data: z
    .object({
      models: z.array(MyModelItemSchema),
      providers: z.array(ModelProviderSchema),
      defaultModelIds: ModelDefaultIdsSchema
    })
    .optional()
    .meta({ description: '版本变化时返回的完整目录；版本一致时省略' })
});
export type GetModelCatalogResponse = z.infer<typeof GetModelCatalogResponseSchema>;

/* ============================================================================
 * API: 获取公开系统模型
 * Route: GET /api/core/ai/model/list
 * Method: GET
 * Description: 无需鉴权返回价格页所需的最小化 active 系统模型与价格信息
 * Tags: ['AI 通用', 'Read']
 * ============================================================================ */

const PublicPriceModelBaseSchema = z.object({
  name: z.string().meta({ example: 'GPT-5', description: '模型展示名称' }),
  provider: z.string().meta({ example: 'openai', description: '模型提供商标识' }),
  testMode: z.boolean().optional().meta({ example: false, description: '是否为测试模式' })
});

const PublicCharsPriceSchema = z.number().optional().meta({
  example: 1,
  description: '对应模型计费单位的积分单价'
});

export const PublicPriceSystemModelSchema = z.discriminatedUnion('type', [
  PublicPriceModelBaseSchema.extend({
    type: z
      .literal(ModelTypeEnum.llm)
      .meta({ example: ModelTypeEnum.llm, description: '模型类型' }),
    priceTiers: z.array(ModelPriceTierSchema).meta({
      example: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }],
      description: '分段输入输出价格配置'
    }),
    config: LLMModelConfigSchema.pick({
      maxContext: true,
      vision: true,
      audio: true,
      video: true,
      reasoning: true
    })
  }),
  PublicPriceModelBaseSchema.extend({
    type: z
      .literal(ModelTypeEnum.embedding)
      .meta({ example: ModelTypeEnum.embedding, description: '模型类型' }),
    charsPointsPrice: PublicCharsPriceSchema,
    config: EmbeddingModelConfigSchema.pick({ maxToken: true })
  }),
  PublicPriceModelBaseSchema.extend({
    type: z
      .literal(ModelTypeEnum.rerank)
      .meta({ example: ModelTypeEnum.rerank, description: '模型类型' }),
    charsPointsPrice: PublicCharsPriceSchema,
    config: RerankModelConfigSchema.pick({ maxToken: true })
  }),
  PublicPriceModelBaseSchema.extend({
    type: z
      .literal(ModelTypeEnum.tts)
      .meta({ example: ModelTypeEnum.tts, description: '模型类型' }),
    charsPointsPrice: PublicCharsPriceSchema
  }),
  PublicPriceModelBaseSchema.extend({
    type: z
      .literal(ModelTypeEnum.stt)
      .meta({ example: ModelTypeEnum.stt, description: '模型类型' }),
    charsPointsPrice: PublicCharsPriceSchema
  })
]);
export type PublicPriceSystemModel = z.infer<typeof PublicPriceSystemModelSchema>;

export const GetSystemModelsResponseSchema = z.object({
  models: z.array(PublicPriceSystemModelSchema),
  providers: z.array(ModelProviderSchema)
});
export type GetSystemModelsResponse = z.infer<typeof GetSystemModelsResponseSchema>;

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
