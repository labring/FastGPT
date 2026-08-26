import { z } from 'zod';
import { SubPlanSchema } from '../../../support/wallet/sub/type';
import type { FastGPTFeConfigsType } from '../../../common/system/types';
import {
  LLMModelConfigSchema,
  ModelPriceTierSchema,
  RerankModelConfigSchema,
  EmbeddingModelConfigSchema
} from '../../../core/ai/model.schema';
import {
  MyEmbeddingModelItemSchema,
  MyLLMModelItemSchema,
  MyRerankModelItemSchema,
  MySTTModelItemSchema,
  MyTTSModelItemSchema
} from '../../core/ai/model/api';
import { ModelTypeEnum } from '../../../core/ai/constants';

/* ============================================================================
 * API: 获取系统初始化数据
 * Route: GET /api/common/system/getInitData
 * Method: GET
 * Description: 根据登录状态和缓存标识返回前端初始化配置、模型和套餐信息
 * Tags: ['系统接口', 'Read']
 * ============================================================================ */

export const GetSystemInitDataQuerySchema = z.object({
  bufferId: z.string().optional().meta({
    example: 'system-config-20260811',
    description: '客户端已有的系统配置缓存标识；一致时服务端返回精简数据'
  })
});
export type GetSystemInitDataQuery = z.infer<typeof GetSystemInitDataQuerySchema>;

const FastGPTFeConfigsSchema = z.looseObject({
  uploadFileMaxAmount: z.number(),
  uploadFileMaxSize: z.number(),
  marketplaceUrl: z.string().url().optional().meta({
    example: 'https://v2.marketplace.fastgpt.cn',
    description: '插件市场服务地址'
  })
}) as z.ZodType<FastGPTFeConfigsType>;

const I18nStringStrictSchema = z.object({
  en: z.string(),
  'zh-CN': z.string(),
  'zh-Hant': z.string()
});

const SystemDefaultModelSchema = z.object({
  [ModelTypeEnum.llm]: MyLLMModelItemSchema.optional(),
  datasetTextLLM: MyLLMModelItemSchema.optional(),
  datasetImageLLM: MyLLMModelItemSchema.optional(),
  chatTitleLLM: MyLLMModelItemSchema.optional(),
  [ModelTypeEnum.embedding]: MyEmbeddingModelItemSchema.optional(),
  [ModelTypeEnum.tts]: MyTTSModelItemSchema.optional(),
  [ModelTypeEnum.stt]: MySTTModelItemSchema.optional(),
  [ModelTypeEnum.rerank]: MyRerankModelItemSchema.optional()
});

export const GetSystemInitDataResponseSchema = z.object({
  bufferId: z.string().optional().meta({
    example: 'system-config-20260811',
    description: '当前系统配置缓存标识；未登录时带 unAuth_ 前缀'
  }),
  feConfigs: FastGPTFeConfigsSchema.optional().meta({
    description: '前端功能开关和链接配置'
  }),
  subPlans: SubPlanSchema.optional().meta({
    description: '系统套餐配置；仅登录用户或价格页面返回'
  }),
  systemVersion: z.string().optional().meta({
    example: '4.16.0',
    description: 'FastGPT 系统版本'
  }),
  defaultModels: SystemDefaultModelSchema.optional().meta({
    description: '按模型用途划分的系统默认模型'
  }),
  modelProviders: z
    .array(
      z.object({
        provider: z.string().meta({
          example: 'openai',
          description: '模型提供商标识'
        }),
        value: I18nStringStrictSchema.meta({
          example: { 'zh-CN': 'OpenAI', en: 'OpenAI' },
          description: '模型提供商多语言名称'
        }),
        avatar: z.string().meta({
          example: '/imgs/model/openai.svg',
          description: '模型提供商图标'
        })
      })
    )
    .optional()
    .meta({ description: '模型提供商列表' }),
  aiproxyChannels: z
    .array(
      z.object({
        channelId: z.number(),
        name: I18nStringStrictSchema,
        avatar: z.string()
      })
    )
    .optional()
    .meta({
      description: 'AI Proxy 渠道配置列表'
    })
});
export type GetSystemInitDataResponse = z.infer<typeof GetSystemInitDataResponseSchema>;

/* ============================================================================
 * API: 获取公开系统模型
 * Route: GET /api/common/system/getSystemModels
 * Method: GET
 * Description: 无需鉴权返回价格页所需的最小化模型与价格信息
 * Tags: ['系统接口', 'Read']
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

export const GetSystemModelsResponseSchema = z.array(PublicPriceSystemModelSchema);
export type GetSystemModelsResponse = z.infer<typeof GetSystemModelsResponseSchema>;

/* ============================================================================
 * API: 唤醒训练队列
 * Route: GET /api/common/system/unlockTask
 * Method: GET
 * Description: 尝试鉴权并唤醒当前实例的知识库训练队列
 * Tags: ['系统接口', 'Write']
 * ============================================================================ */

export const UnlockSystemTaskQuerySchema = z.object({}).meta({
  description: '该接口不需要查询参数'
});
export type UnlockSystemTaskQuery = z.infer<typeof UnlockSystemTaskQuerySchema>;

export const UnlockSystemTaskResponseSchema = z.undefined().meta({
  description: '唤醒请求已处理'
});
export type UnlockSystemTaskResponse = z.infer<typeof UnlockSystemTaskResponseSchema>;
