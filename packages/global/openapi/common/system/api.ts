import { z } from 'zod';
import { SubPlanSchema } from '../../../support/wallet/sub/type';
import type { FastGPTFeConfigsType } from '../../../common/system/types';

/* ============================================================================
 * API: 获取系统初始化数据
 * Route: GET /api/common/system/getInitData
 * Method: GET
 * Description: 根据登录状态和缓存标识返回前端系统配置和套餐信息；模型目录独立加载
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
