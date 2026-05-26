import z from 'zod';
import { ModelTypeEnum } from '../../../../core/ai/constants';
import {
  ModelPriceTierSchema,
  LLMModelItemSchema,
  EmbeddingModelItemSchema,
  TTSModelItemSchema,
  STTModelItemSchema,
  RerankModelItemSchema
} from '../../../../core/ai/model.schema';

export const SystemModelItemSchema = z.discriminatedUnion('type', [
  LLMModelItemSchema,
  EmbeddingModelItemSchema,
  TTSModelItemSchema,
  STTModelItemSchema,
  RerankModelItemSchema
]);

/* ============================================================================
 * 公共: 模型列表项 Schema
 * ============================================================================ */

export const ModelListItemSchema = z.object({
  id: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '模型 ID'
  }),
  type: z.enum(ModelTypeEnum).meta({
    example: ModelTypeEnum.llm,
    description: '模型类型'
  }),
  name: z.string().meta({
    example: 'GPT-4o',
    description: '模型名称'
  }),
  avatar: z.string().optional().meta({
    example: '/imgs/model/gpt4o.png',
    description: '模型头像'
  }),
  provider: z.string().meta({
    example: 'openai',
    description: '模型提供商'
  }),
  model: z.string().meta({
    example: 'gpt-4o',
    description: '模型标识'
  }),
  testMode: z.boolean().optional().meta({
    description: '是否为测试模式'
  }),
  charsPointsPrice: z.number().optional().meta({
    description: '按字符计费价格'
  }),
  inputPrice: z.number().optional().meta({
    description: '输入价格 (1k tokens)'
  }),
  outputPrice: z.number().optional().meta({
    description: '输出价格 (1k tokens)'
  }),
  priceTiers: z.array(ModelPriceTierSchema).optional().meta({
    description: '梯度价格配置'
  }),
  isActive: z.boolean().meta({
    example: true,
    description: '是否激活'
  }),
  isCustom: z.boolean().meta({
    example: false,
    description: '是否为自定义模型'
  }),
  isTuned: z.boolean().meta({
    example: false,
    description: '是否为微调模型'
  }),
  contextToken: z.number().optional().meta({
    example: 128000,
    description: '上下文 token 数'
  }),
  vision: z.boolean().optional().meta({
    example: true,
    description: '是否支持视觉'
  }),
  toolChoice: z.boolean().optional().meta({
    example: true,
    description: '是否支持工具调用'
  }),
  tmbId: z.string().optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '团队成员 ID'
  }),
  isShared: z.boolean().meta({
    example: false,
    description: '是否为共享模型'
  }),
  sourceMember: z
    .object({
      name: z.string().meta({ description: '成员名称' }),
      avatar: z.string().nullable().optional().meta({ description: '成员头像' }),
      status: z.string().meta({ description: '成员状态' })
    })
    .optional()
    .meta({
      description: '来源成员信息'
    }),
  permission: z.any().meta({
    description: '当前用户对该模型的权限'
  })
});

export type ModelListItem = z.infer<typeof ModelListItemSchema>;

/* ============================================================================
 * API: 获取模型列表
 * Route: POST /api/core/ai/model/list
 * Method: POST
 * Description: 获取当前团队可见的模型全量列表
 * Tags: ['Model', 'Read']
 * ============================================================================ */

export const ListModelsResponseSchema = z.array(ModelListItemSchema);

export type ListModelsResponse = z.infer<typeof ListModelsResponseSchema>;

/* ============================================================================
 * API: 创建模型
 * Route: POST /api/core/ai/model/create
 * Method: POST
 * Description: 创建自定义模型,返回新创建的模型 ID
 * Tags: ['Model', 'Write']
 * ============================================================================ */

export const CreateModelBodySchema = z.discriminatedUnion('type', [
  LLMModelItemSchema.omit({ id: true }),
  EmbeddingModelItemSchema.omit({ id: true }),
  TTSModelItemSchema.omit({ id: true }),
  STTModelItemSchema.omit({ id: true }),
  RerankModelItemSchema.omit({ id: true })
]);

export type CreateModelBody = z.infer<typeof CreateModelBodySchema>;

export const CreateModelResponseSchema = z.object({
  id: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '新创建的模型 ID'
  })
});

export type CreateModelResponse = z.infer<typeof CreateModelResponseSchema>;

/* ============================================================================
 * API: 更新模型
 * Route: PUT /api/core/ai/model/update
 * Method: PUT
 * Description: 更新模型配置元数据,支持部分更新
 * Tags: ['Model', 'Write']
 * ============================================================================ */

const _AllPartialModelFields = LLMModelItemSchema.omit({ id: true, type: true })
  .partial()
  .extend(EmbeddingModelItemSchema.omit({ id: true, type: true }).partial().shape)
  .extend(TTSModelItemSchema.omit({ id: true, type: true }).partial().shape)
  .extend(STTModelItemSchema.omit({ id: true, type: true }).partial().shape)
  .extend(RerankModelItemSchema.omit({ id: true, type: true }).partial().shape);

export const UpdateModelBodySchema = z
  .object({
    id: z.string().meta({
      example: '68ad85a7463006c963799a05',
      description: '模型 ID'
    }),
    type: z.enum(ModelTypeEnum).optional().meta({
      description: '模型类型'
    })
  })
  .extend(_AllPartialModelFields.shape);

export type UpdateModelBody = z.infer<typeof UpdateModelBodySchema>;

export const UpdateModelResponseSchema = z.object({});

export type UpdateModelResponse = z.infer<typeof UpdateModelResponseSchema>;

/* ============================================================================
 * API: 删除模型
 * Route: DELETE /api/core/ai/model/delete
 * Method: DELETE
 * Description: 删除指定的自定义模型(系统模型不可删除)
 * Tags: ['Model', 'Delete']
 * ============================================================================ */

export const DeleteModelQuerySchema = z.object({
  id: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '模型 ID'
  })
});

export type DeleteModelQuery = z.infer<typeof DeleteModelQuerySchema>;

export const DeleteModelResponseSchema = z.object({});

export type DeleteModelResponse = z.infer<typeof DeleteModelResponseSchema>;

/* ============================================================================
 * API: 获取模型详情
 * Route: GET /api/core/ai/model/detail
 * Method: GET
 * Description: 根据模型 ID 获取模型详细信息
 * Tags: ['Model', 'Read']
 * ============================================================================ */

export const GetModelDetailQuerySchema = z.object({
  id: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '模型 ID'
  })
});

export type GetModelDetailQuery = z.infer<typeof GetModelDetailQuerySchema>;

export const GetModelDetailResponseSchema = SystemModelItemSchema;

export type GetModelDetailResponse = z.infer<typeof GetModelDetailResponseSchema>;

/* ============================================================================
 * API: 测试模型
 * Route: GET /api/core/ai/model/test
 * Method: GET
 * Description: 测试模型连通性,根据模型类型执行对应的测试请求
 * Tags: ['Model', 'Read']
 * ============================================================================ */

export const TestModelQuerySchema = z.object({
  id: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '模型 ID'
  }),
  channelId: z.coerce.number().optional().meta({
    description: '指定渠道 ID 测试'
  })
});

export type TestModelQuery = z.infer<typeof TestModelQuerySchema>;

/* ============================================================================
 * API: 获取默认模型配置
 * Route: GET /api/core/ai/model/getDefaultConfig
 * Method: GET
 * Description: 获取指定模型的默认配置(管理员接口)
 * Tags: ['Model', 'Admin', 'Read']
 * ============================================================================ */

export const GetDefaultConfigQuerySchema = z.object({
  id: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '模型 ID'
  })
});

export type GetDefaultConfigQuery = z.infer<typeof GetDefaultConfigQuerySchema>;

export const GetDefaultConfigResponseSchema = SystemModelItemSchema;

export type GetDefaultConfigResponse = z.infer<typeof GetDefaultConfigResponseSchema>;

/* ============================================================================
 * API: 更新默认模型
 * Route: PUT /api/core/ai/model/updateDefault
 * Method: PUT
 * Description: 更新系统默认模型配置(管理员接口),设置各场景的默认模型
 * Tags: ['Model', 'Admin', 'Write']
 * ============================================================================ */

export const UpdateDefaultModelBodySchema = z.object({
  llmId: z.string().optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '默认 LLM 模型 ID'
  }),
  embeddingId: z.string().optional().meta({
    example: '68ad85a7463006c963799a06',
    description: '默认向量模型 ID'
  }),
  ttsId: z.string().optional().meta({
    example: '68ad85a7463006c963799a07',
    description: '默认 TTS 模型 ID'
  }),
  sttId: z.string().optional().meta({
    example: '68ad85a7463006c963799a08',
    description: '默认 STT 模型 ID'
  }),
  rerankId: z.string().optional().meta({
    example: '68ad85a7463006c963799a09',
    description: '默认 ReRank 模型 ID'
  }),
  datasetTextLLMId: z.string().optional().meta({
    example: '68ad85a7463006c963799a10',
    description: '知识库文本理解默认模型 ID'
  }),
  datasetImageLLMId: z.string().optional().meta({
    example: '68ad85a7463006c963799a11',
    description: '知识库图片理解默认模型 ID'
  }),
  evaluationId: z.string().optional().meta({
    example: '68ad85a7463006c963799a12',
    description: '评估默认模型 ID'
  })
});

export type UpdateDefaultModelBody = z.infer<typeof UpdateDefaultModelBodySchema>;

export const UpdateDefaultModelResponseSchema = z.object({});

export type UpdateDefaultModelResponse = z.infer<typeof UpdateDefaultModelResponseSchema>;

/* ============================================================================
 * API: 通过 JSON 批量更新模型
 * Route: PUT /api/core/ai/model/updateWithJson
 * Method: PUT
 * Description: 通过 JSON 配置批量导入/更新模型(管理员接口),会清空现有模型并全量替换
 * Tags: ['Model', 'Admin', 'Write']
 * ============================================================================ */

export const SystemModelConfigJsonItemSchema = z
  .object({
    id: z.string().optional().meta({
      example: '68ad85a7463006c963799a05',
      description: '模型 ID,不传则自动生成'
    }),
    type: z.enum(ModelTypeEnum).optional().meta({
      description: '模型类型'
    })
  })
  .extend(_AllPartialModelFields.shape);

export type SystemModelConfigJsonItem = z.infer<typeof SystemModelConfigJsonItemSchema>;

export const UpdateWithJsonBodySchema = z.object({
  config: z.string().meta({
    example: '[{"model":"gpt-4o","metadata":{"type":"llm","name":"GPT-4o","provider":"openai"}}]',
    description: '模型配置 JSON 字符串'
  })
});

export type UpdateWithJsonBody = z.infer<typeof UpdateWithJsonBodySchema>;

export const UpdateWithJsonResponseSchema = z.object({});

export type UpdateWithJsonResponse = z.infer<typeof UpdateWithJsonResponseSchema>;

/* ============================================================================
 * API: 获取模型配置 JSON
 * Route: GET /api/core/ai/model/getConfigJson
 * Method: GET
 * Description: 导出所有模型配置为 JSON 字符串(管理员接口)
 * Tags: ['Model', 'Admin', 'Read']
 * ============================================================================ */

export const GetConfigJsonResponseSchema = z.string().meta({
  description: '模型配置 JSON 字符串'
});

export type GetConfigJsonResponse = z.infer<typeof GetConfigJsonResponseSchema>;
