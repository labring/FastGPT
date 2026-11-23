import { z } from 'zod';
import { SubPlanSchema } from '../../../support/wallet/sub/type';
import { FastGPTFeConfigsSchema } from '../../../common/system/types';
import { BoolSchema, NumSchema } from '../../../common/zod';

/* ============================================================================
 * API: 获取系统初始化数据
 * Route: GET /api/common/system/getInitData
 * Method: GET
 * Description: 按会话鉴权返回公开前端配置；includeSubPlans 显式请求公开套餐，不依赖页面路径；模型目录独立加载
 * Tags: ['系统接口', 'Read']
 * ============================================================================ */

export const GetSystemInitDataQuerySchema = z.object({
  bufferId: z.string().optional().meta({
    example: 'system-config-20260811',
    description: '客户端已有的系统配置缓存标识；一致时服务端返回精简数据'
  }),
  includeSubPlans: BoolSchema.optional().meta({
    example: true,
    description: '显式获取公开套餐，匿名及配置缓存命中时也返回；不改变配置鉴权与字段过滤'
  })
});
export type GetSystemInitDataQuery = z.infer<typeof GetSystemInitDataQuerySchema>;

/* ============================================================================
 * API: 获取 Pro SSO 接入状态
 * Route: GET /api/common/system/sso/config (Pro 内部接口)
 * Method: GET
 * Description: 返回 Pro 部署环境中的 SSO 接入状态，不返回服务地址或凭据；仅在显式请求 includeProvider=true 时探测 provider 类型
 * Tags: ['系统接口', 'Read']
 * ============================================================================ */

export const ProSsoConfigQuerySchema = z.object({
  includeProvider: BoolSchema.optional().meta({
    description:
      '是否探测并返回 SSO provider 类型（isWecom）；未传或为 false 时仅返回 enabled，兼容旧版主服务 .strict() 校验并避免密码策略路径触发外部探测',
    example: true
  })
});
export type ProSsoConfigQuery = z.infer<typeof ProSsoConfigQuerySchema>;

export const ProSsoConfigResponseSchema = z
  .object({
    enabled: z.boolean().meta({ description: 'Pro 是否配置 SSO 服务', example: true }),
    isWecom: z.boolean().optional().meta({
      description:
        'SSO 服务是否使用企业微信 provider；仅在 includeProvider=true 且探测成功时返回，未返回表示未探测或无法确认',
      example: false
    })
  })
  .strict();
export type ProSsoConfigResponse = z.infer<typeof ProSsoConfigResponseSchema>;

// 配置存储兼容历史扩展；传输结构只暴露声明字段，且精简响应不补业务默认值。
const ClientFeConfigsSchema = FastGPTFeConfigsSchema.partial()
  .strip()
  .extend({
    // 仅为环境变量的客户端投影，不属于可存储、可编辑的系统配置。
    showAuxiliaryGenerationRunDetail: BoolSchema.optional().meta({
      description: '是否展示辅助生成运行详情，仅由 AUXILIARY_GENERATION_SHOW_RUN_DETAIL 控制',
      example: false
    }),
    // SSO 根地址只在服务端访问；客户端通过能力标志展示入口，点击后按需获取授权地址。
    sso: FastGPTFeConfigsSchema.shape.sso
      .unwrap()
      .extend({
        enabled: BoolSchema.meta({ description: '是否配置了 SSO 登录服务', example: true }),
        isWecom: BoolSchema.optional().meta({
          description: 'SSO 是否使用企业微信；省略表示旧版或无法确认',
          example: false
        })
      })
      .optional(),
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
    description:
      '当前系统配置缓存标识；未登录时带 unAuth_v10_sso_ 前缀，包含匿名规则和 SSO provider 状态'
  }),
  feConfigs: ClientFeConfigsSchema.optional().meta({
    description:
      '前端功能开关和链接配置；登录后仅返回 Schema 声明的公开字段，匿名统一投影登录、价格和分享聊天所需的公共字段白名单'
  }),
  subPlans: SubPlanSchema.optional().meta({
    description: '系统套餐配置；登录用户在缓存未命中时返回；includeSubPlans=true 时始终返回'
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
