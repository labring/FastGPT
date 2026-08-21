import { z } from 'zod';
import { SubPlanSchema } from '../../../support/wallet/sub/type';
import type { FastGPTFeConfigsType } from '../../../common/system/types';
import {
  EmbeddingModelItemSchema,
  LLMModelItemSchema,
  RerankModelItemSchema,
  STTModelItemSchema,
  TTSModelItemSchema
} from '../../../core/ai/model.schema';
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
  uploadFileMaxSize: z.number()
}) as z.ZodType<FastGPTFeConfigsType>;

const PublicLLMModelSchema = LLMModelItemSchema.omit({
  defaultSystemChatPrompt: true,
  fieldMap: true,
  defaultConfig: true,
  requestUrl: true,
  requestAuth: true
});
const PublicEmbeddingModelSchema = EmbeddingModelItemSchema.omit({
  defaultConfig: true,
  dbConfig: true,
  queryConfig: true,
  requestUrl: true,
  requestAuth: true
});
const PublicRerankModelSchema = RerankModelItemSchema.omit({
  defaultConfig: true,
  requestUrl: true,
  requestAuth: true
});
const PublicTTSModelSchema = TTSModelItemSchema.omit({ requestUrl: true, requestAuth: true });
const PublicSTTModelSchema = STTModelItemSchema.omit({ requestUrl: true, requestAuth: true });

const PublicSystemModelSchema = z
  .discriminatedUnion('type', [
    PublicLLMModelSchema,
    PublicEmbeddingModelSchema,
    PublicTTSModelSchema,
    PublicSTTModelSchema,
    PublicRerankModelSchema
  ])
  .meta({
    description: '脱敏后的系统模型配置'
  });

const I18nStringStrictSchema = z.object({
  en: z.string(),
  'zh-CN': z.string(),
  'zh-Hant': z.string()
});

const SystemDefaultModelSchema = z.object({
  [ModelTypeEnum.llm]: PublicLLMModelSchema.optional(),
  datasetTextLLM: PublicLLMModelSchema.optional(),
  datasetImageLLM: PublicLLMModelSchema.optional(),
  chatTitleLLM: PublicLLMModelSchema.optional(),
  [ModelTypeEnum.embedding]: PublicEmbeddingModelSchema.optional(),
  [ModelTypeEnum.tts]: PublicTTSModelSchema.optional(),
  [ModelTypeEnum.stt]: PublicSTTModelSchema.optional(),
  [ModelTypeEnum.rerank]: PublicRerankModelSchema.optional()
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
  activeModelList: z.array(PublicSystemModelSchema).optional().meta({
    description: '当前可用的脱敏模型列表'
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
