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
import { ObjectIdSchema } from '../../../../../common/type/mongo';
import { I18nStringSchema } from '../../../../../common/i18n/type';

const ModelIdSchema = ObjectIdSchema.meta({
  example: '68ad85a7463006c963799a05',
  description: '模型稳定 ObjectId'
});

export const AdminSystemModelReferenceSchema = z.object({
  modelId: ModelIdSchema
});
export type AdminSystemModelReference = z.infer<typeof AdminSystemModelReferenceSchema>;

const ModelIdsSchema = z
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
    description: '待批量操作的系统模型 ID，最多 500 个且不可重复'
  });

/* ============================================================================
 * API: 批量删除系统模型
 * Route: DELETE /api/admin/settings/model/delete
 * Method: DELETE
 * Description: 按 modelIds 批量删除系统模型；兼容旧版 modelId query
 * Tags: ['系统模型管理', 'Delete']
 * ============================================================================ */

export const DeleteSystemModelsBodySchema = z.object({
  modelIds: ModelIdsSchema
});
export type DeleteSystemModelsBody = z.infer<typeof DeleteSystemModelsBodySchema>;

/* ============================================================================
 * API: 获取管理员系统模型列表
 * Route: GET /api/admin/settings/model/list
 * Method: GET
 * Description: 获取全部系统作用域模型
 * Tags: ['系统模型管理', 'Read']
 * ============================================================================ */

export const AdminModelChannelSchema = z.object({
  id: IntSchema.positive().meta({ example: 1, description: 'AI Proxy 渠道 ID' }),
  name: z.string().meta({ example: 'OpenAI 主渠道', description: '渠道名称' }),
  protocol: z.object({
    name: I18nStringSchema.meta({ description: '渠道协议名称' }),
    avatar: z.string().meta({ example: 'model/openai', description: '渠道协议图标' })
  }),
  status: IntSchema.meta({ example: 1, description: 'AI Proxy 渠道状态' })
});
export type AdminModelChannel = z.infer<typeof AdminModelChannelSchema>;

export const AdminSystemModelListItemSchema = SystemModelDataSchema.and(
  z.object({
    channels: z.array(AdminModelChannelSchema).meta({ description: '当前模型关联的渠道摘要' })
  })
);
export type AdminSystemModelListItem = z.infer<typeof AdminSystemModelListItemSchema>;

export const GetAdminSystemModelListResponseSchema = z.object({
  models: z.array(AdminSystemModelListItemSchema),
  channels: z.array(AdminModelChannelSchema).meta({
    description: '全部渠道摘要，供新增、编辑和关联渠道交互复用'
  }),
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
 * Tags: ['系统模型管理', 'Read']
 * ============================================================================ */

export const AdminSystemModelDetailChannelSchema = AdminModelChannelSchema.extend({
  isAssociated: z.boolean().meta({
    example: true,
    description: '当前渠道是否已关联该模型'
  })
});
export type AdminSystemModelDetailChannel = z.infer<typeof AdminSystemModelDetailChannelSchema>;

export const GetAdminSystemModelDetailResponseSchema = z.object({
  model: SystemModelDataSchema.meta({ description: '完整模型参数' }),
  channels: z.array(AdminSystemModelDetailChannelSchema).meta({
    description: '全部渠道展示信息及其与当前模型的关联状态'
  })
});
export type GetAdminSystemModelDetailResponse = z.infer<
  typeof GetAdminSystemModelDetailResponseSchema
>;

/* ============================================================================
 * API: 测试系统模型配置
 * Route: GET /api/admin/settings/model/test
 * Method: GET
 * Description: 按 modelId 测试系统模型调用
 * Tags: ['系统模型管理', 'Read']
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
 * API: 测试尚未创建的管理员系统模型
 * Route: POST /api/admin/settings/model/test
 * Method: POST
 * Description: 使用当前模型表单草稿和指定 AI Proxy 渠道发起测试，不持久化模型
 * Tags: ['系统模型管理', 'Read']
 * ============================================================================ */

export const TestDraftAdminSystemModelBodySchema = z
  .object({
    modelData: SystemModelDocumentDataSchema.meta({
      description: '尚未持久化的完整系统模型配置'
    }),
    channelId: IntSchema.positive().meta({
      example: 1,
      description: '本次测试指定的 AI Proxy 渠道 ID'
    })
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
export type TestDraftAdminSystemModelBody = z.infer<typeof TestDraftAdminSystemModelBodySchema>;

const ModelTemplateReferenceSchema = z.object({
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

/* ============================================================================
 * API: 获取管理员模型模板列表
 * Route: GET /api/admin/settings/model/templates
 * Method: GET
 * Description: 实时读取 Plugin 模型模板，不使用服务端缓存
 * Tags: ['系统模型管理', 'Read']
 * ============================================================================ */

export const GetAdminModelTemplatesResponseSchema = z.object({
  models: z.array(SystemModelDocumentDataSchema).meta({ description: '当前 Plugin 模型模板' }),
  providers: z.array(ModelProviderSchema).meta({ description: '模型提供商元数据' })
});
export type GetAdminModelTemplatesResponse = z.infer<typeof GetAdminModelTemplatesResponseSchema>;

/* ============================================================================
 * API: 创建自定义系统模型
 * Route: POST /api/admin/settings/model/create
 * Method: POST
 * Description: 按最新持久化结构创建自定义系统模型
 * Tags: ['系统模型管理', 'Write']
 * ============================================================================ */

const CreateSystemModelDataSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (
      typeof value === 'object' &&
      value !== null &&
      Object.prototype.hasOwnProperty.call(value, 'modelId')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['modelId'],
        message: 'modelId is not allowed when creating a model'
      });
    }
  })
  .pipe(SystemModelDocumentDataSchema)
  .meta({ description: '不含 modelId 的完整系统模型配置' });

export const CreateSystemModelBodySchema = z
  .object({
    modelData: CreateSystemModelDataSchema,
    channelIds: z.array(IntSchema.positive()).default([]).meta({
      description: '创建前统一绑定的 AI Proxy 渠道；允许为空数组'
    })
  })
  .strict();
export type CreateSystemModelBody = z.infer<typeof CreateSystemModelBodySchema>;
export const CreateSystemModelResponseSchema = z.object({
  modelId: ModelIdSchema
});
export type CreateSystemModelResponse = z.infer<typeof CreateSystemModelResponseSchema>;

/* ============================================================================
 * API: 从 Plugin 模板批量创建系统模型
 * Route: POST /api/admin/settings/model/createFromTemplates
 * Method: POST
 * Description: 重新拉取模板并先绑定渠道，再事务级创建尚未安装的模型
 * Tags: ['系统模型管理', 'Write']
 * ============================================================================ */

export const CreateSystemModelsFromTemplatesBodySchema = z
  .object({
    templates: z
      .array(ModelTemplateReferenceSchema)
      .min(1)
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
    channelIds: z.array(IntSchema.positive()).meta({
      example: [1, 2],
      description: '统一关联的 AI Proxy 渠道 ID；允许为空数组'
    })
  })
  .strict();
export type CreateSystemModelsFromTemplatesBody = z.infer<
  typeof CreateSystemModelsFromTemplatesBodySchema
>;

export const CreatedSystemModelSchema = ModelTemplateReferenceSchema.extend({
  modelId: ModelIdSchema
});
export type CreatedSystemModel = z.infer<typeof CreatedSystemModelSchema>;

export const CreateSystemModelsFromTemplatesResponseSchema = z.object({
  models: z.array(CreatedSystemModelSchema).meta({
    description: '本次实际新建的模型；已安装的重复项不会再次创建'
  })
});
export type CreateSystemModelsFromTemplatesResponse = z.infer<
  typeof CreateSystemModelsFromTemplatesResponseSchema
>;

/* ============================================================================
 * API: 替换模型渠道绑定
 * Route: PUT /api/admin/settings/model/channel/replace
 * Method: PUT
 * Tags: ['系统模型管理', 'Write']
 * ============================================================================ */

export const ReplaceSystemModelChannelsBodySchema = z
  .object({
    modelId: ModelIdSchema,
    channelIds: z.array(IntSchema.positive()).meta({
      description: '替换后的完整渠道 ID 集合；允许为空数组'
    })
  })
  .strict();
export type ReplaceSystemModelChannelsBody = z.infer<typeof ReplaceSystemModelChannelsBodySchema>;

/* ============================================================================
 * API: 更新系统模型配置
 * Route: PUT /api/admin/settings/model/update
 * Method: PUT
 * Description: 只按 modelId 更新已有系统模型的可编辑参数，模型标识不可修改
 * Tags: ['系统模型管理', 'Write']
 * ============================================================================ */

export const UpdateSystemModelDataSchema = z
  .discriminatedUnion('type', [
    LLMSystemModelDocumentSchema.omit({ model: true }).strict(),
    EmbeddingSystemModelDocumentSchema.omit({ model: true }).strict(),
    TTSSystemModelDocumentSchema.omit({ model: true }).strict(),
    STTSystemModelDocumentSchema.omit({ model: true }).strict(),
    RerankSystemModelDocumentSchema.omit({ model: true }).strict()
  ])
  .meta({ description: '不含不可变模型标识的系统模型可编辑参数' });
export type UpdateSystemModelData = z.infer<typeof UpdateSystemModelDataSchema>;

export const UpdateSystemModelBodySchema = z
  .object({
    modelId: ModelIdSchema,
    modelData: UpdateSystemModelDataSchema
  })
  .strict();
export type UpdateSystemModelBody = z.infer<typeof UpdateSystemModelBodySchema>;

/* ============================================================================
 * API: 批量更新系统模型启停状态
 * Route: PUT /api/admin/settings/model/updateStatus
 * Method: PUT
 * Description: 按 modelIds 批量启用或停用系统模型
 * Tags: ['系统模型管理', 'Write']
 * ============================================================================ */

export const UpdateSystemModelStatusBodySchema = z.object({
  modelIds: ModelIdsSchema,
  isActive: z.boolean().meta({ example: true, description: '目标启用状态' })
});
export type UpdateSystemModelStatusBody = z.infer<typeof UpdateSystemModelStatusBodySchema>;

// 配置 JSON 允许来自其他实例的 ID；导入逻辑只把本实例真实 ObjectId 用作 `_id`，其余按 model 对齐。
const ImportedModelIdField = {
  modelId: z.string().trim().min(1).meta({
    example: 'source-instance-model-id',
    description: '源实例模型 ID，仅用于导入时识别记录'
  }),
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
 * Description: 忽略无 modelId 的旧记录；本实例 modelId 只更新可编辑参数并保留原 model，外部记录按 model 创建或更新
 * Tags: ['系统模型管理', 'Write']
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
 * Tags: ['系统模型管理', 'Read']
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
 * Tags: ['系统模型管理', 'Write']
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
