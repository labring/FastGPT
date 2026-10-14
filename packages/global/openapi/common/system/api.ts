import { z } from 'zod';
import { SubPlanSchema } from '../../../support/wallet/sub/type';
import { FastGPTFeConfigsSchema } from '../../../common/system/types';
import { NumSchema } from '../../../common/zod';

/* ============================================================================
 * API: 获取系统初始化数据
 * Route: GET /api/common/system/getInitData
 * Method: GET
 * Description: 登录后返回声明的公开前端配置；匿名统一返回公共页面必要字段，价格页额外获取公开套餐信息；模型目录独立加载
 * Tags: ['系统接口', 'Read']
 * ============================================================================ */

export const GetSystemInitDataQuerySchema = z.object({
  bufferId: z.string().optional().meta({
    example: 'system-config-20260811',
    description: '客户端已有的系统配置缓存标识；一致时服务端返回精简数据'
  })
});
export type GetSystemInitDataQuery = z.infer<typeof GetSystemInitDataQuerySchema>;

// 配置存储兼容历史扩展；传输结构只暴露声明字段，且精简响应不补业务默认值。
const ClientFeConfigsSchema = FastGPTFeConfigsSchema.partial()
  .strip()
  .extend({
    limit: FastGPTFeConfigsSchema.shape.limit
      .unwrap()
      .partial()
      .strip()
      .extend({
        uploadFileMaxAmount: NumSchema.optional(),
        uploadFileMaxSize: NumSchema.optional()
      })
      .optional()
  });

export const GetSystemInitDataResponseSchema = z.object({
  bufferId: z.string().optional().meta({
    example: 'system-config-20260811',
    description: '当前系统配置缓存标识；未登录时带 unAuth_v8_ 前缀，包含匿名过滤规则版本'
  }),
  feConfigs: ClientFeConfigsSchema.optional().meta({
    description:
      '前端功能开关和链接配置；登录后仅返回 Schema 声明的公开字段，匿名统一投影登录、价格和分享聊天所需的公共字段白名单'
  }),
  subPlans: SubPlanSchema.optional().meta({
    description:
      '系统套餐配置；登录用户在缓存未命中时返回；Referer 的 pathname 为 /price 时始终返回'
  }),
  systemVersion: z.string().optional().meta({
    example: '4.16.0',
    description: 'FastGPT 系统版本'
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
