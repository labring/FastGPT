import { IntSchema } from '../../../../common/zod';
import z from 'zod';

/* ============================================================================
 * API: AI Proxy 渠道与监控管理
 * Routes: /api/aiproxy/api/channels/*, /api/aiproxy/api/channel/*,
 *         /api/aiproxy/api/logs/*, /api/aiproxy/api/dashboardv2/
 * Methods: GET/POST/PUT/DELETE
 * Description: 管理 AI Proxy 渠道，并查询渠道调用日志与统计数据
 * Tags: ['模型管理', '渠道管理', '监控日志']
 * ============================================================================ */

/* ============================================================================
 * API: 创建 AI Proxy 渠道
 * Route: POST /api/aiproxy/api/createChannel
 * Method: POST
 * Description: 创建一个 AI Proxy 渠道，并返回第三方代理生成的渠道 ID
 * Tags: ['模型管理', '渠道管理', 'Write']
 * ============================================================================ */
export const CreateAdminAIProxyChannelBodySchema = z
  .object({
    name: z.string().trim().min(1).meta({ description: '渠道名称', example: 'OpenAI' }),
    type: IntSchema.positive().meta({ description: 'AI Proxy 协议类型', example: 1 }),
    base_url: z.string().optional().meta({ description: '渠道模型服务地址' }),
    key: z
      .string()
      .refine((key) => key.split('\n').filter((line) => line.trim()).length <= 1, {
        message: 'Only one channel credential is supported'
      })
      .optional()
      .meta({ description: '单个渠道模型服务凭证；不支持换行分隔多个密钥' }),
    models: z.array(z.string().trim().min(1)).optional().meta({ description: '支持的模型标识' }),
    model_mapping: z.record(z.string(), z.unknown()).optional().meta({ description: '模型映射' }),
    priority: IntSchema.positive().optional().meta({ description: '渠道优先级', example: 1 })
  })
  .passthrough();
export type CreateAdminAIProxyChannelBody = z.infer<typeof CreateAdminAIProxyChannelBodySchema>;

/**
 * 创建渠道的响应结构。
 *
 * AI Proxy 接口使用 success 作为判别字段，并保留第三方 envelope，
 * 因此这里不转换为 FastGPT NextAPI 常见的 data 响应格式。
 */
export const CreateAdminAIProxyChannelResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: z.object({
      id: IntSchema.positive().meta({ description: '创建成功的准确渠道 ID', example: 1 })
    })
  }),
  z.object({ success: z.literal(false), message: z.string().optional() })
]);
export type CreateAdminAIProxyChannelResponse = z.infer<
  typeof CreateAdminAIProxyChannelResponseSchema
>;

/** 渠道更新、删除和状态变更接口共用的路径参数。 */
export const AIProxyChannelPathSchema = z.object({
  channelId: IntSchema.positive().meta({ description: 'AI Proxy 渠道 ID', example: 1 })
});
export type AIProxyChannelPath = z.infer<typeof AIProxyChannelPathSchema>;

/**
 * AI Proxy 返回的完整渠道配置。
 *
 * 该结构同时用于渠道列表响应和渠道更新请求；更新请求会通过 omit
 * 移除由服务端维护的 id 与 created_at 字段。
 */
const AIProxyChannelConfigSchema = z.object({
  id: IntSchema.positive().meta({ description: 'AI Proxy 渠道 ID', example: 1 }),
  type: IntSchema.positive().meta({ description: 'AI Proxy 协议类型', example: 1 }),
  name: z.string().meta({ description: '渠道名称', example: 'OpenAI 主渠道' }),
  base_url: z.string().meta({ description: '模型服务地址' }),
  proxy_url: z.string().nullish().meta({ description: '代理地址' }),
  models: z.array(z.string()).meta({ description: '渠道支持的模型标识' }),
  model_mapping: z.record(z.string(), z.unknown()).nullish().meta({ description: '模型映射' }),
  configs: z.record(z.string(), z.unknown()).nullish().meta({ description: '渠道扩展配置' }),
  key: z.string().optional().meta({ description: '渠道凭证' }),
  status: IntSchema.meta({ description: '渠道状态：0 未知，1 启用，2 停用，3 自动停用' }),
  priority: IntSchema.meta({ description: '渠道优先级' }),
  sets: z.array(z.string()).nullish().meta({ description: '渠道分组' }),
  enabled_auto_balance_check: z.boolean().optional().meta({ description: '是否启用自动余额检查' }),
  balance_threshold: z.number().optional().meta({ description: '余额阈值' }),
  skip_tls_verify: z.boolean().optional().meta({ description: '是否跳过 TLS 校验' }),
  enabled_no_permission_ban: z.boolean().optional().meta({ description: '是否启用无权限自动禁用' }),
  warn_error_rate: z.number().optional().meta({ description: '告警错误率' }),
  max_error_rate: z.number().optional().meta({ description: '最大错误率' }),
  created_at: z.number().optional().meta({ description: '创建时间戳' })
});
export type AIProxyChannelConfig = z.infer<typeof AIProxyChannelConfigSchema>;

/* ============================================================================
 * API: 获取 AI Proxy 渠道列表
 * Route: GET /api/aiproxy/api/channels/all
 * Method: GET
 * Description: 获取管理员可配置的全部 AI Proxy 渠道及其当前状态
 * Tags: ['模型管理', '渠道管理', 'Read']
 * ============================================================================ */
export const GetAIProxyChannelListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(AIProxyChannelConfigSchema).meta({ description: 'AI Proxy 渠道列表' })
});
export type GetAIProxyChannelListResponse = z.infer<typeof GetAIProxyChannelListResponseSchema>;

/* ============================================================================
 * API: 获取 AI Proxy 渠道协议元数据
 * Route: GET /api/aiproxy/api/channels/type_metas
 * Method: GET
 * Description: 获取各渠道协议的名称、默认地址和凭证填写说明
 * Tags: ['模型管理', '渠道管理', 'Read']
 * ============================================================================ */
export const GetAIProxyChannelTypesResponseSchema = z.object({
  success: z.literal(true),
  data: z.record(
    z.string(),
    z.object({
      defaultBaseUrl: z.string().meta({ description: '协议默认服务地址' }),
      keyHelp: z.string().meta({ description: '凭证填写说明' }),
      name: z.string().meta({ description: '协议名称' })
    })
  )
});
export type GetAIProxyChannelTypesResponse = z.infer<typeof GetAIProxyChannelTypesResponseSchema>;

/* ============================================================================
 * API: 更新 AI Proxy 渠道
 * Route: PUT /api/aiproxy/api/channel/{channelId}
 * Method: PUT
 * Description: 更新指定渠道的连接配置、模型映射、优先级和自动检查策略
 * Tags: ['模型管理', '渠道管理', 'Write']
 * ============================================================================ */
export const UpdateAIProxyChannelBodySchema = AIProxyChannelConfigSchema.omit({
  id: true,
  created_at: true
});
export type UpdateAIProxyChannelBody = z.infer<typeof UpdateAIProxyChannelBodySchema>;

/* ============================================================================
 * API: 更新 AI Proxy 渠道状态
 * Route: POST /api/aiproxy/api/channel/{channelId}/status
 * Method: POST
 * Description: 启用、停用或设置指定渠道的自动停用状态
 * Tags: ['模型管理', '渠道管理', 'Write']
 * ============================================================================ */
export const UpdateAIProxyChannelStatusBodySchema = z.object({
  status: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).meta({
    description: '渠道状态：0 未知，1 启用，2 停用，3 自动停用',
    example: 1
  })
});
export type UpdateAIProxyChannelStatusBody = z.infer<typeof UpdateAIProxyChannelStatusBodySchema>;

/** 更新、删除和状态变更接口共用的成功响应。 */
export const AIProxyMutationResponseSchema = z.object({ success: z.literal(true) });
export type AIProxyMutationResponse = z.infer<typeof AIProxyMutationResponseSchema>;

/* ============================================================================
 * API: 查询 AI Proxy 渠道监控日志
 * Route: GET /api/aiproxy/api/logs/search
 * Method: GET
 * Description: 按请求、渠道、模型、时间范围和结果类型分页查询调用日志
 * Tags: ['模型管理', '监控日志', 'Read']
 * ============================================================================ */
export const SearchAIProxyLogsQuerySchema = z.object({
  request_id: z.string().optional().meta({ description: '请求 ID' }),
  channel: IntSchema.positive().optional().meta({ description: '渠道 ID' }),
  model_name: z.string().optional().meta({ description: '模型名称' }),
  code_type: z.enum(['all', 'success', 'error']).optional().meta({ description: '结果类型' }),
  start_timestamp: z.number().meta({ description: '开始时间戳' }),
  end_timestamp: z.number().meta({ description: '结束时间戳' }),
  p: IntSchema.positive().optional().meta({ description: '页码', example: 1 }),
  per_page: IntSchema.positive().optional().meta({ description: '每页数量', example: 20 })
});
export type SearchAIProxyLogsQuery = z.infer<typeof SearchAIProxyLogsQuerySchema>;

/** 渠道监控日志列表中的单条请求记录。 */
const AIProxyLogItemSchema = z.object({
  token_name: z.string(),
  model: z.string(),
  request_id: z.string(),
  id: IntSchema.positive(),
  channel: IntSchema.positive(),
  mode: IntSchema,
  created_at: z.number(),
  request_at: z.number(),
  code: IntSchema,
  usage: z.record(z.string(), z.number()).optional(),
  endpoint: z.string(),
  content: z.string().optional(),
  retry_times: IntSchema.optional(),
  ttfb_milliseconds: z.number().optional(),
  ip: z.string()
});

export const SearchAIProxyLogsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    logs: z.array(AIProxyLogItemSchema),
    total: IntSchema
  })
});
export type SearchAIProxyLogsResponse = z.infer<typeof SearchAIProxyLogsResponseSchema>;

/* ============================================================================
 * API: 获取 AI Proxy 渠道监控日志详情
 * Route: GET /api/aiproxy/api/logs/detail/{id}
 * Method: GET
 * Description: 获取指定日志的原始请求体和响应体
 * Tags: ['模型管理', '监控日志', 'Read']
 * ============================================================================ */
export const AIProxyLogDetailPathSchema = z.object({
  id: IntSchema.positive().meta({ description: '日志 ID', example: 1 })
});
export type AIProxyLogDetailPath = z.infer<typeof AIProxyLogDetailPathSchema>;

export const GetAIProxyLogDetailResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    request_body: z.string().meta({ description: '请求内容' }),
    response_body: z.string().meta({ description: '响应内容' })
  })
});
export type GetAIProxyLogDetailResponse = z.infer<typeof GetAIProxyLogDetailResponseSchema>;

/* ============================================================================
 * API: 获取 AI Proxy 渠道统计看板
 * Route: GET /api/aiproxy/api/dashboardv2/
 * Method: GET
 * Description: 按渠道、模型、时间范围和统计粒度获取调用趋势数据
 * Tags: ['模型管理', '监控日志', 'Read']
 * ============================================================================ */
export const GetAIProxyDashboardQuerySchema = z.object({
  channel: IntSchema.positive().optional().meta({ description: '渠道 ID' }),
  model: z.string().optional().meta({ description: '模型标识' }),
  start_timestamp: z.number().optional().meta({ description: '开始时间戳' }),
  end_timestamp: z.number().optional().meta({ description: '结束时间戳' }),
  timezone: z.string().meta({ description: '时区', example: 'Asia/Shanghai' }),
  timespan: z.enum(['day', 'hour', 'minute']).meta({ description: '统计粒度' })
});
export type GetAIProxyDashboardQuery = z.infer<typeof GetAIProxyDashboardQuerySchema>;

export const GetAIProxyDashboardResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      timestamp: z.number(),
      summary: z.array(z.record(z.string(), z.number()))
    })
  )
});
export type GetAIProxyDashboardResponse = z.infer<typeof GetAIProxyDashboardResponseSchema>;
