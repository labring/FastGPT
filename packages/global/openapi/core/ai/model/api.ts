import { ModelScopeEnum, ModelTypeEnum } from '../../../../core/ai/constants';
import {
  EmbeddingModelConfigSchema,
  EmbeddingSystemModelDocumentSchema,
  LLMModelConfigSchema,
  LLMSystemModelDocumentSchema,
  ModelPriceTierSchema,
  RerankModelConfigSchema,
  RerankSystemModelDocumentSchema,
  STTModelConfigSchema,
  STTSystemModelDocumentSchema,
  SystemModelDataSchema,
  SystemModelDocumentDataSchema,
  TTSModelConfigSchema,
  TTSSystemModelDocumentSchema
} from '../../../../core/ai/model/schema';
import z from 'zod';
import { IntSchema } from '../../../../common/zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { I18nStringSchema } from '../../../../common/i18n/type';
import { ModelDefaultIdsSchema } from '../../../../core/ai/model/default';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { AIScopeSchema } from '../scope';

export const ModelChannelSummarySchema = z.object({
  id: IntSchema.positive().meta({ example: 1, description: 'AI Proxy 渠道 ID' }),
  name: z.string().meta({ example: 'OpenAI 主渠道', description: '渠道名称' }),
  protocol: z.object({
    name: I18nStringSchema.meta({ description: '渠道协议名称' }),
    avatar: z.string().meta({ example: 'model/openai', description: '渠道协议图标' })
  }),
  status: IntSchema.meta({ example: 1, description: 'AI Proxy 渠道状态' })
});
export type ModelChannelSummary = z.infer<typeof ModelChannelSummarySchema>;

const MyModelBaseSchema = z.object({
  modelId: z.string().meta({ description: '模型稳定 ID' }),
  model: z.string().meta({ description: 'Provider 请求使用的模型标识' }),
  name: z.string().meta({ description: '模型展示名称' }),
  provider: z.string().meta({ description: '模型提供商标识' }),
  scope: z.nativeEnum(ModelScopeEnum).meta({ description: '模型实例作用域' }),
  tmbId: z.string().optional().meta({ description: '模型归属成员 ID' }),
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
 * API: 获取当前成员可用模型清单
 * Route: GET /api/core/ai/model/catalog
 * Method: GET
 * Description: 通过登录态或外链身份返回对应成员完整可用模型、Provider 与有效默认模型 ID；版本一致时省略数据
 * Tags: ['模型管理', 'Read']
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
 * Tags: ['模型管理', 'Read']
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
 * API: 获取团队私有模型列表（用户侧模型配置）
 * Route: GET /api/core/ai/model/teamModels
 * Method: GET
 * Description: 获取当前登录团队成员名下的私有模型列表及关联的团队渠道摘要
 * Tags: ['模型管理', 'Read']
 * ============================================================================ */

export const TeamModelListItemSchema = z
  .object({
    modelId: z.string().meta({ description: '模型稳定 ID' }),
    model: z.string().meta({ description: 'Provider 请求使用的模型标识' }),
    name: z.string().meta({ description: '模型展示名称' }),
    provider: z.string().meta({ description: '模型提供商标识' }),
    scope: z.nativeEnum(ModelScopeEnum).default(ModelScopeEnum.team),
    type: z.nativeEnum(ModelTypeEnum),
    tmbId: z.string().optional(),
    avatar: z.string().optional(),
    isActive: z.boolean().optional(),
    testMode: z.boolean().optional(),
    charsPointsPrice: z.number().optional(),
    priceTiers: z.array(ModelPriceTierSchema).optional(),
    inputPrice: z.number().optional(),
    outputPrice: z.number().optional(),
    config: z.record(z.string(), z.any()).optional(),
    channels: z.array(ModelChannelSummarySchema).meta({ description: '当前模型关联的渠道摘要' })
  })
  .passthrough();
export type TeamModelListItem = z.infer<typeof TeamModelListItemSchema>;

export const GetTeamModelsResponseSchema = z.object({
  models: z.array(TeamModelListItemSchema),
  channels: z.array(ModelChannelSummarySchema),
  providers: z.array(ModelProviderSchema)
});
export type GetTeamModelsResponse = z.infer<typeof GetTeamModelsResponseSchema>;

/* ============================================================================
 * 通用模型管理契约 (Core AI Model Management)
 * ============================================================================ */

export const ModelIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a05',
  description: '模型稳定 ObjectId'
});

export const ModelChannelTypeSchema = AIScopeSchema.meta({
  description: '模型作用域类型'
});
export type ModelChannelType = z.infer<typeof ModelChannelTypeSchema>;

export const ModelReferenceSchema = z.object({
  modelId: ModelIdSchema,
  channelType: ModelChannelTypeSchema
});
export type ModelReference = z.infer<typeof ModelReferenceSchema>;

export const ModelIdsSchema = z
  .array(ModelIdSchema)
  .min(1)
  .max(500)
  .superRefine((modelIds, ctx) => {
    if (new Set(modelIds).size !== modelIds.length) {
      ctx.addIssue({ code: 'custom', message: 'modelIds must be unique' });
    }
  })
  .meta({
    example: ['68ad85a7463006c963799a05', '68ad85a7463006c963799a06'],
    description: '待批量操作的模型 ID 列表，最多 500 个且不可重复'
  });

/* DELETE /api/core/ai/model/delete */
export const DeleteModelsBodySchema = z.object({
  modelIds: ModelIdsSchema,
  channelType: ModelChannelTypeSchema
});
export type DeleteModelsBody = z.infer<typeof DeleteModelsBodySchema>;

/* GET /api/core/ai/model/detail */
export const ModelDetailChannelSchema = ModelChannelSummarySchema.extend({
  isAssociated: z.boolean().meta({
    example: true,
    description: '当前渠道是否已关联该模型'
  })
});
export type ModelDetailChannel = z.infer<typeof ModelDetailChannelSchema>;

export const GetModelDetailResponseSchema = z.object({
  model: SystemModelDataSchema.meta({ description: '完整模型参数' }),
  channels: z.array(ModelDetailChannelSchema).meta({
    description: '全部渠道展示信息及其与当前模型的关联状态'
  })
});
export type GetModelDetailResponse = z.infer<typeof GetModelDetailResponseSchema>;

/* GET & POST /api/core/ai/model/test */
export const TestModelQuerySchema = ModelReferenceSchema.extend({
  channelId: IntSchema.positive().optional().meta({
    example: 1,
    description: '可选的 AI Proxy 渠道 ID'
  })
});
export type TestModelQuery = z.infer<typeof TestModelQuerySchema>;

const TestModelPriceFields = {
  charsPointsPrice: true,
  priceTiers: true,
  inputPrice: true,
  outputPrice: true
} as const;

export const TestDraftModelDataSchema = z
  .discriminatedUnion('type', [
    LLMSystemModelDocumentSchema.omit(TestModelPriceFields),
    EmbeddingSystemModelDocumentSchema.omit(TestModelPriceFields),
    TTSSystemModelDocumentSchema.omit(TestModelPriceFields),
    STTSystemModelDocumentSchema.omit(TestModelPriceFields),
    RerankSystemModelDocumentSchema.omit(TestModelPriceFields)
  ])
  .meta({ description: '仅包含实际模型调用所需字段的表单草稿；计费字段会被忽略' });

export const TestDraftModelBodySchema = z
  .object({
    modelData: TestDraftModelDataSchema.meta({
      description: '新增或编辑中的当前模型运行参数；计费字段不参与测试'
    }),
    channelId: IntSchema.positive().meta({
      example: 1,
      description: '本次测试指定的 AI Proxy 渠道 ID'
    }),
    channelType: ModelChannelTypeSchema
  })
  .strict()
  .superRefine(({ modelData }, ctx) => {
    if (modelData.type === ModelTypeEnum.tts && modelData.config.voices.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        origin: 'array',
        inclusive: true,
        path: ['modelData', 'config', 'voices'],
        message: 'TTS model test requires at least one voice'
      });
    }
  });
export type TestDraftModelBody = z.infer<typeof TestDraftModelBodySchema>;

/* GET /api/core/ai/model/templates */
export const ModelTemplateReferenceSchema = z.object({
  type: z.nativeEnum(ModelTypeEnum).meta({
    example: ModelTypeEnum.llm,
    description: '模板模型类型'
  }),
  model: z.string().trim().min(1).meta({
    example: 'gpt-5.4',
    description: '模板模型标识'
  })
});
export type ModelTemplateReference = z.infer<typeof ModelTemplateReferenceSchema>;

export const GetModelTemplatesQuerySchema = z.object({
  channelType: ModelChannelTypeSchema
});
export type GetModelTemplatesQuery = z.infer<typeof GetModelTemplatesQuerySchema>;

export const GetModelTemplatesResponseSchema = z.object({
  models: z.array(SystemModelDocumentDataSchema).meta({ description: '当前 Plugin 模型模板' }),
  providers: z.array(ModelProviderSchema).meta({ description: '模型提供商元数据' })
});
export type GetModelTemplatesResponse = z.infer<typeof GetModelTemplatesResponseSchema>;

/* POST /api/core/ai/model/updateChannels */
export const UpdateModelChannelsBodySchema = z
  .object({
    modelId: ModelIdSchema,
    channelType: AIScopeSchema.meta({
      description: '模型作用域；必填，服务端据此先鉴权再查询模型，避免无权限成员探测模型是否存在'
    }),
    addChannelIds: z.array(IntSchema.positive()).max(500).optional().meta({
      description: '需要关联到该模型的渠道 ID，已关联的渠道会被忽略'
    }),
    removeChannelIds: z.array(IntSchema.positive()).max(500).optional().meta({
      description: '需要解除与该模型关联的渠道 ID，同时清理渠道内该模型的映射；渠道本身不删除'
    })
  })
  .strict();
export type UpdateModelChannelsBody = z.infer<typeof UpdateModelChannelsBodySchema>;

/* POST /api/core/ai/model/create */
export const CreateModelBodySchema = z
  .object({
    modelData: SystemModelDocumentDataSchema.meta({
      description: '完整模型配置；未声明字段会被忽略，modelId 始终由服务端生成'
    }),
    channelType: ModelChannelTypeSchema,
    channelIds: z.array(IntSchema.positive()).optional().meta({
      description: '可选：创建模型后同时关联追加的已有渠道 ID 列表'
    })
  })
  .strict();
export type CreateModelBody = z.infer<typeof CreateModelBodySchema>;

export const CreateModelResponseSchema = z.object({
  modelId: ModelIdSchema
});
export type CreateModelResponse = z.infer<typeof CreateModelResponseSchema>;

/* POST /api/core/ai/model/createFromTemplates */
export const CreateModelsFromTemplatesBodySchema = z
  .object({
    templates: z
      .array(ModelTemplateReferenceSchema)
      .min(1)
      .max(500)
      .superRefine((templates, ctx) => {
        const keys = new Set<string>();
        templates.forEach((template, index) => {
          const key = template.model;
          if (keys.has(key)) {
            ctx.addIssue({
              code: 'custom',
              path: [index],
              message: `Duplicate model template: ${template.model}`
            });
          }
          keys.add(key);
        });
      })
      .meta({ description: '本次选择的模板临时键' }),
    channelType: ModelChannelTypeSchema
  })
  .strict();
export type CreateModelsFromTemplatesBody = z.infer<typeof CreateModelsFromTemplatesBodySchema>;

export const CreatedModelSchema = ModelTemplateReferenceSchema.extend({
  modelId: ModelIdSchema
});
export type CreatedModel = z.infer<typeof CreatedModelSchema>;

export const CreateModelsFromTemplatesResponseSchema = z.object({
  models: z.array(CreatedModelSchema).meta({
    description: '本次实际新建的模型；已安装的重复项不会再次创建'
  })
});
export type CreateModelsFromTemplatesResponse = z.infer<
  typeof CreateModelsFromTemplatesResponseSchema
>;

/* PUT /api/core/ai/model/update */
const UpdateModelField = {
  model: z.string().trim().min(1).optional().meta({
    description: '模型标识；若未提供则保持当前模型标识不变'
  })
};

export const UpdateModelDataSchema = z
  .discriminatedUnion('type', [
    LLMSystemModelDocumentSchema.omit({ tmbId: true, teamId: true })
      .extend(UpdateModelField)
      .strict(),
    EmbeddingSystemModelDocumentSchema.omit({ tmbId: true, teamId: true })
      .extend(UpdateModelField)
      .strict(),
    TTSSystemModelDocumentSchema.omit({ tmbId: true, teamId: true })
      .extend(UpdateModelField)
      .strict(),
    STTSystemModelDocumentSchema.omit({ tmbId: true, teamId: true })
      .extend(UpdateModelField)
      .strict(),
    RerankSystemModelDocumentSchema.omit({ tmbId: true, teamId: true })
      .extend(UpdateModelField)
      .strict()
  ])
  .meta({
    description: '模型可编辑参数；model 为可选更新，type 仅用于分支校验不参与类型变更'
  });
export type UpdateModelData = z.infer<typeof UpdateModelDataSchema>;

export const UpdateModelBodySchema = z
  .object({
    modelId: ModelIdSchema,
    modelData: UpdateModelDataSchema,
    channelType: ModelChannelTypeSchema
  })
  .strict();
export type UpdateModelBody = z.infer<typeof UpdateModelBodySchema>;

/* PUT /api/core/ai/model/updateStatus */
export const UpdateModelStatusBodySchema = z.object({
  modelIds: ModelIdsSchema,
  isActive: z.boolean().meta({ example: true, description: '目标启用状态' }),
  channelType: ModelChannelTypeSchema
});
export type UpdateModelStatusBody = z.infer<typeof UpdateModelStatusBodySchema>;

/* ============================================================================
 * API: 获取系统模型管理配置
 * Route: GET /api/core/ai/model/list?channelType=system
 * Method: GET
 * Description: 获取系统模型、渠道、Provider 与默认模型配置
 * Tags: ['Model', 'Admin', 'Read']
 * ============================================================================ */

export const SystemModelListItemSchema = SystemModelDataSchema.and(
  z.object({
    channels: z.array(ModelChannelSummarySchema).meta({ description: '当前模型关联的渠道摘要' })
  })
);
export type SystemModelListItem = z.infer<typeof SystemModelListItemSchema>;

export const GetSystemModelConfigResponseSchema = z.object({
  models: z.array(SystemModelListItemSchema),
  channels: z.array(ModelChannelSummarySchema).meta({
    description: '全部渠道摘要，供新增、编辑和关联渠道交互复用'
  }),
  providers: z.array(ModelProviderSchema),
  defaultModelIds: ModelDefaultIdsSchema,
  aiproxyChannels: z.array(
    z.object({
      channelId: z.number(),
      name: z.object({ en: z.string(), 'zh-CN': z.string(), 'zh-Hant': z.string() }),
      avatar: z.string(),
      website: z.string().optional()
    })
  )
});
export type GetSystemModelConfigResponse = z.infer<typeof GetSystemModelConfigResponseSchema>;

/* GET /api/core/ai/model/config */
export const GetModelConfigQuerySchema = z.object({
  channelType: AIScopeSchema.meta({
    example: 'system',
    description: 'system=系统模型管理配置；team=当前成员私有模型配置'
  })
});
export type GetModelConfigQuery = z.infer<typeof GetModelConfigQuerySchema>;

export const GetModelConfigResponseSchema = z.union([
  GetSystemModelConfigResponseSchema,
  GetTeamModelsResponseSchema
]);
export type GetModelConfigResponse = z.infer<typeof GetModelConfigResponseSchema>;

// 配置 JSON 允许来自其他实例的 ID；导入逻辑只把本实例真实 ObjectId 用作 `_id`，其余按 model 对齐。
const ImportedModelIdField = {
  modelId: z.string().trim().min(1).meta({
    example: 'source-instance-model-id',
    description: '源实例模型 ID，仅用于导入时识别记录'
  }),
  scope: z.literal(ModelScopeEnum.system).meta({ description: '系统模型作用域' })
};

export const ImportedSystemModelSchema = z.discriminatedUnion('type', [
  LLMSystemModelDocumentSchema.extend({ ...ImportedModelIdField, config: LLMModelConfigSchema }),
  EmbeddingSystemModelDocumentSchema.extend({
    ...ImportedModelIdField,
    config: EmbeddingModelConfigSchema
  }),
  TTSSystemModelDocumentSchema.extend({ ...ImportedModelIdField, config: TTSModelConfigSchema }),
  STTSystemModelDocumentSchema.extend({ ...ImportedModelIdField, config: STTModelConfigSchema }),
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

/* PUT /api/core/ai/model/updateWithJson */
export const UpdateSystemModelsWithJsonBodySchema = z.object({
  config: JsonSystemModelListSchema.pipe(ImportedSystemModelRecordListSchema).meta({
    example:
      '[{"modelId":"68ad85a7463006c963799a05","scope":"system","type":"llm","provider":"OpenAI","model":"gpt-5","name":"GPT-5","isActive":true,"config":{"maxContext":400000,"maxResponse":128000,"quoteMaxToken":300000,"toolChoice":true}}]',
    description: '最新系统模型配置 JSON；无 modelId 的旧记录会被忽略'
  })
});
export type UpdateSystemModelsWithJsonBody = z.input<typeof UpdateSystemModelsWithJsonBodySchema>;
export type ParsedSystemModelsWithJsonBody = z.output<typeof UpdateSystemModelsWithJsonBodySchema>;

/* GET /api/core/ai/model/getConfigJson */
export const GetSystemModelConfigJsonResponseSchema = z.string().meta({
  description: '最新系统模型配置 JSON 字符串'
});
export type GetSystemModelConfigJsonResponse = z.infer<
  typeof GetSystemModelConfigJsonResponseSchema
>;

/* PUT /api/core/ai/model/updateDefault */
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
