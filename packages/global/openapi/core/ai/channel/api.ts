import z from 'zod';
import { PaginationResponseSchema } from '../../../api';
import { SourceMemberSchema } from '../../../../support/user/type';
import { IntSchema } from '../../../../common/zod';

const OptionalIntSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  IntSchema.optional()
);

// ═══ Channel (aiproxy) management schemas — design §2.9.4 ═══
// aiproxy is the single source of truth for channels (no local collection).
// Clients only send the aiproxy channel id; groupId is always derived server-side.

// ═══ Channel kind for resource ops ═══
// The caller declares whether the target channel is a system channel or a member
// (team) channel — resolve routes by this instead of inferring from the role
// (design §2.9.4; symmetric with create's groupType).
export const ChannelTypeEnumSchema = z.enum(['system', 'team']);
export type ChannelType = z.infer<typeof ChannelTypeEnumSchema>;

// ═══ Shared channel payload (create/update) ═══
// Mirrors aiproxy AddChannelRequest (core/controller/channel.go).
// status is narrowed to the literal union (1=启用 / 2=禁用) so the parsed body
// is directly assignable to the service AddChannelData type without casts.
export const ChannelBodySchema = z.object({
  name: z.string().meta({ description: '渠道名' }),
  type: z
    .number()
    .int()
    .meta({ description: '提供商类型（如 1=openai、14=anthropic、36=deepseek）' }),
  key: z.string().meta({ description: 'aiproxy 原生 API Key 凭证' }),
  base_url: z.string().optional().meta({ description: '自定义端点覆盖' }),
  models: z
    .array(z.string())
    .meta({ description: '渠道服务的上游模型名（与模型 model 字段匹配）' }),
  model_mapping: z
    .record(z.string(), z.string())
    .optional()
    .meta({ description: '公共名 → 上游实际名映射' }),
  priority: z.number().int().optional().meta({ description: '负载均衡权重，默认 10' }),
  status: z
    .union([z.literal(1), z.literal(2)])
    .optional()
    .meta({ description: '1=启用 / 2=禁用' }),
  sets: z.array(z.string()).optional().meta({ description: '模型集合，默认 default' }),
  configs: z.record(z.string(), z.unknown()).optional().meta({ description: '提供商额外配置' })
});
export type ChannelBody = z.infer<typeof ChannelBodySchema>;

// ═══ POST /api/core/ai/channel/create ═══
// The caller declares the channel kind explicitly (groupType) — the server does
// not infer it from the role, so root can create member channels too (root is
// also a team admin). groupId is never sent; it is always derived from the session.
export const CreateChannelBodySchema = ChannelBodySchema.extend({
  groupType: z.enum(['system', 'team']).meta({
    description: 'system=系统渠道（root 专用）；team=本人所在团队的成员渠道'
  })
});
export type CreateChannelBody = z.infer<typeof CreateChannelBodySchema>;
// aiproxy AddChannel returns no payload (data=null), so no id can be echoed back.
export const CreateChannelResponseSchema = z
  .undefined()
  .meta({ description: '操作成功（前端刷新列表获取新渠道）' });
export type CreateChannelResponse = z.infer<typeof CreateChannelResponseSchema>;

// ═══ PUT /api/core/ai/channel/update ═══
// aiproxy PUT is a full replacement; id selects the channel, the rest is the new payload.
export const UpdateChannelBodySchema = ChannelBodySchema.extend({
  id: z.number().int().meta({ example: 12, description: 'aiproxy 渠道 ID' }),
  channelType: ChannelTypeEnumSchema.meta({
    description: 'system=系统渠道（root 专用）；team=成员渠道'
  })
}).partial();
export type UpdateChannelBody = z.infer<typeof UpdateChannelBodySchema>;

export const UpdateChannelResponseSchema = z.undefined().meta({ description: '操作成功' });
export type UpdateChannelResponse = z.infer<typeof UpdateChannelResponseSchema>;

// ═══ DELETE /api/core/ai/channel/delete ═══
// Resource id via query — same convention as model delete (DeleteModelQuerySchema).
export const DeleteChannelQuerySchema = z.object({
  id: z.coerce.number().int().meta({ example: 12, description: 'aiproxy 渠道 ID' }),
  channelType: ChannelTypeEnumSchema.meta({
    description: 'system=系统渠道（root 专用）；team=成员渠道'
  })
});
export type DeleteChannelQuery = z.infer<typeof DeleteChannelQuerySchema>;

export const AffectedModelItemSchema = z.object({
  modelId: z.string().meta({ description: '平台模型 ID' }),
  name: z.string().meta({ description: '模型展示名' }),
  model: z.string().meta({ description: '上游 provider model 名' })
});
export type AffectedModelItem = z.infer<typeof AffectedModelItemSchema>;

// Delete returns the pre-deletion affected models (design §2.9.4: 二次确认数据源)。
export const DeleteChannelResponseSchema = z.object({
  affectedModels: z
    .array(AffectedModelItemSchema)
    .meta({ description: '仅关联该渠道的模型（删除后不可调用）' })
});
export type DeleteChannelResponse = z.infer<typeof DeleteChannelResponseSchema>;

// ═══ POST /api/core/ai/channel/status ═══
// POST carries id + status in the body (no GET-style query precedent exists for status ops).
export const UpdateChannelStatusBodySchema = z.object({
  id: z.number().int().meta({ example: 12, description: 'aiproxy 渠道 ID' }),
  status: z.union([z.literal(1), z.literal(2)]).meta({ description: '1=启用 / 2=禁用' }),
  channelType: ChannelTypeEnumSchema.meta({
    description: 'system=系统渠道（root 专用）；team=成员渠道'
  })
});
export type UpdateChannelStatusBody = z.infer<typeof UpdateChannelStatusBodySchema>;

export const UpdateChannelStatusResponseSchema = z.undefined().meta({ description: '操作成功' });
export type UpdateChannelStatusResponse = z.infer<typeof UpdateChannelStatusResponseSchema>;

// ═══ GET /api/core/ai/channel/test ═══
// Resource id via query — same convention as model test (TestModelQuerySchema).
export const TestChannelQuerySchema = z.object({
  id: z.coerce.number().int().meta({ example: 12, description: 'aiproxy 渠道 ID' }),
  model: z.string().meta({ description: '待测试的上游模型名' }),
  channelType: ChannelTypeEnumSchema.meta({
    description: 'system=系统渠道（root 专用）；team=成员渠道'
  })
});
export type TestChannelQuery = z.infer<typeof TestChannelQuerySchema>;

export const TestChannelResponseSchema = z
  .undefined()
  .meta({ description: '测试成功（结果持久化到 aiproxy）' });
export type TestChannelResponse = z.infer<typeof TestChannelResponseSchema>;

// ═══ GET /api/core/ai/channel/models ═══
// All models the channel serves within its own bucket (hover detail for the
// related-model column, F2-S5 场景3/4) — unlike affectedModels which only
// returns models that would lose their only channel.
export const ChannelModelItemSchema = z.object({
  modelId: z.string().meta({ description: '平台模型 ID' }),
  name: z.string().meta({ description: '模型展示名' }),
  model: z.string().meta({ description: '上游 provider model 名' })
});
export type ChannelModelItem = z.infer<typeof ChannelModelItemSchema>;

export const GetChannelModelsQuerySchema = z.object({
  id: z.coerce.number().int().meta({ example: 12, description: 'aiproxy 渠道 ID' }),
  channelType: ChannelTypeEnumSchema.meta({
    description: 'system=系统渠道（root 专用）；team=成员渠道'
  })
});
export type GetChannelModelsQuery = z.infer<typeof GetChannelModelsQuerySchema>;

export const ChannelModelsResponseSchema = z.object({
  models: z.array(ChannelModelItemSchema).meta({ description: '渠道桶内全部关联模型' })
});
export type ChannelModelsResponse = z.infer<typeof ChannelModelsResponseSchema>;

// ═══ GET /api/core/ai/channel/modelChannels ═══
// Channels serving one model within its own bucket (hover detail for the model
// list's channelCount column, design §7.3/F2-S5 场景2). modelId selects the
// model; the bucket is derived server-side (system model → system channels;
// private model → its owner's group channels). The reverse direction of
// /api/core/ai/channel/models.
export const ModelChannelBriefSchema = z.object({
  id: z.number().int().meta({ example: 12, description: 'aiproxy 渠道 ID' }),
  name: z.string().meta({ description: '渠道名' }),
  status: z.number().int().meta({ description: '1=启用 / 2=禁用 / 3=自动禁用' })
});
export type ModelChannelBrief = z.infer<typeof ModelChannelBriefSchema>;

export const GetModelChannelsQuerySchema = z.object({
  modelId: z.string().meta({ example: '68ad85a7463006c963799a05', description: '平台模型 ID' })
});
export type GetModelChannelsQuery = z.infer<typeof GetModelChannelsQuerySchema>;

export const ModelChannelsResponseSchema = z.object({
  channels: z.array(ModelChannelBriefSchema).meta({ description: '该模型桶内关联的全部渠道' })
});
export type ModelChannelsResponse = z.infer<typeof ModelChannelsResponseSchema>;

// ═══ GET /api/core/ai/channel/affectedModels ═══
// Pre-check for the delete confirmation dialog (F2-S4/F3-S4).
export const GetAffectedModelsQuerySchema = z.object({
  id: z.coerce.number().int().meta({ example: 12, description: 'aiproxy 渠道 ID' }),
  channelType: ChannelTypeEnumSchema.meta({
    description: 'system=系统渠道（root 专用）；team=成员渠道'
  })
});
export type GetAffectedModelsQuery = z.infer<typeof GetAffectedModelsQuerySchema>;

export const AffectedModelsResponseSchema = z.object({
  affectedModels: z.array(AffectedModelItemSchema)
});
export type AffectedModelsResponse = z.infer<typeof AffectedModelsResponseSchema>;

// ═══ GET /api/core/ai/channel/list ═══
export const ListChannelsQuerySchema = z.object({
  pageNum: z.coerce.number().optional().meta({ description: '页码，从 1 开始' }),
  pageSize: z.coerce.number().optional().meta({ description: '每页条数，不传返回全量' }),
  // Root only: system = 系统渠道视图；team = 全量成员渠道视图（跨成员运维）。
  // 成员请求不带 groupType（或非 root 时忽略），恒为本人渠道视图。
  groupType: z
    .enum(['system', 'team'])
    .optional()
    .meta({ description: 'root 专用：system=系统渠道，team=全量成员渠道' })
});
export type ListChannelsQuery = z.infer<typeof ListChannelsQuerySchema>;

export const ChannelListItemSchema = z.object({
  id: z.number().int().meta({ example: 12, description: 'aiproxy 渠道 ID' }),
  name: z.string(),
  type: z.number().int().meta({ description: '提供商类型' }),
  status: z.number().int().meta({ description: '1=启用 / 2=禁用' }),
  models: z.array(z.string()).meta({ description: '上游模型名列表' }),
  model_mapping: z.record(z.string(), z.string()).optional(),
  base_url: z.string().optional(),
  priority: z.number().int().optional(),
  sets: z.array(z.string()).optional(),
  used_amount: z.number().optional(),
  request_count: z.number().optional(),
  created_at: z.number().optional().meta({ description: '创建时间（Unix 毫秒）' }),
  group_id: z
    .string()
    .optional()
    .meta({ description: '成员渠道的 groupId（fastgpt:tmb:<tmbId>）；系统渠道无此字段' }),
  sourceMember: SourceMemberSchema.optional().meta({
    description: '创建人信息（仅 root 团队渠道视图返回）'
  }),
  relatedModelCount: z.number().meta({ description: '关联的模型数（同归属桶内模型名匹配数）' })
});
export type ChannelListItem = z.infer<typeof ChannelListItemSchema>;

export const ListChannelsResponseSchema = PaginationResponseSchema(ChannelListItemSchema);
export type ListChannelsResponse = z.infer<typeof ListChannelsResponseSchema>;

// ═══ GET /api/core/ai/channel/providerMetas ═══
// aiproxy channel type metas for the channel create/edit form (default URL +
// key format hint per provider). Non-sensitive provider defaults — served to
// any authenticated user; previously root-only via the admin passthrough.
export const ProviderMetaItemSchema = z.object({
  defaultBaseUrl: z.string().meta({ description: '协议默认请求地址' }),
  keyHelp: z.string().meta({ description: 'API Key 格式提示' }),
  name: z.string().meta({ description: '协议名' })
});
export type ProviderMetaItem = z.infer<typeof ProviderMetaItemSchema>;

export const ProviderMetasResponseSchema = z
  .record(z.string().regex(/^\d+$/), ProviderMetaItemSchema)
  .meta({ description: '渠道类型 ID → 协议元信息' });
export type ProviderMetasResponse = z.infer<typeof ProviderMetasResponseSchema>;

/* ============================================================================
 * API: 查询模型渠道调用日志
 * Route: GET /api/core/ai/channel/logs
 * Method: GET
 * Description: 按当前登录成员推导的渠道范围查询 aiproxy 日志
 * Tags: ['Model', 'Channel', 'Log', 'Read']
 * ============================================================================ */

export const ChannelObservabilityScopeSchema = ChannelTypeEnumSchema.meta({
  example: 'team',
  description: 'system=系统渠道（仅 root）；team=当前成员本人的私有渠道'
});
export type ChannelObservabilityScope = z.infer<typeof ChannelObservabilityScopeSchema>;

export const GetChannelLogsQuerySchema = z.object({
  channelType: ChannelObservabilityScopeSchema,
  requestId: z.string().optional().meta({ example: 'req_xxx', description: '请求 ID' }),
  channelId: OptionalIntSchema.meta({ example: 12, description: '渠道 ID；为空表示全部渠道' }),
  modelName: z.string().optional().meta({ example: 'gpt-4o', description: '上游模型名' }),
  codeType: z.enum(['all', 'success', 'error']).optional().meta({
    example: 'all',
    description: '响应状态分类'
  }),
  startTimestamp: IntSchema.meta({
    example: 1787500800000,
    description: '查询开始时间（Unix 毫秒）'
  }),
  endTimestamp: IntSchema.meta({
    example: 1787673599999,
    description: '查询结束时间（Unix 毫秒）'
  }),
  pageNum: IntSchema.positive().optional().meta({ example: 1, description: '页码，从 1 开始' }),
  pageSize: IntSchema.positive().max(100).meta({ example: 20, description: '每页条数，最大 100' })
});
export type GetChannelLogsQuery = z.infer<typeof GetChannelLogsQuerySchema>;

export const ChannelLogUsageSchema = z.object({
  cache_creation_tokens: IntSchema.optional().meta({
    example: 0,
    description: '缓存创建 Token 数'
  }),
  cached_tokens: IntSchema.optional().meta({ example: 0, description: '缓存命中 Token 数' }),
  input_tokens: IntSchema.optional().meta({ example: 100, description: '输入 Token 数' }),
  output_tokens: IntSchema.optional().meta({ example: 20, description: '输出 Token 数' }),
  total_tokens: IntSchema.optional().meta({ example: 120, description: '总 Token 数' })
});
export type ChannelLogUsage = z.infer<typeof ChannelLogUsageSchema>;

export const ChannelLogListItemSchema = z.object({
  token_name: z.string().optional().meta({ example: 'default', description: 'aiproxy Token 名' }),
  model: z.string().meta({ example: 'gpt-4o', description: '上游模型名' }),
  request_id: z.string().optional().meta({ example: 'req_xxx', description: '请求 ID' }),
  id: IntSchema.meta({ example: 1001, description: '日志 ID' }),
  channel: IntSchema.meta({ example: 12, description: '归一化后的渠道 ID' }),
  mode: IntSchema.optional().meta({ example: 1, description: '请求模式' }),
  created_at: IntSchema.meta({ example: 1787670000000, description: '完成时间（Unix 毫秒）' }),
  request_at: IntSchema.meta({ example: 1787669999000, description: '请求时间（Unix 毫秒）' }),
  code: IntSchema.meta({ example: 200, description: '上游响应状态码' }),
  usage: ChannelLogUsageSchema.optional().meta({ description: 'Token 用量' }),
  endpoint: z
    .string()
    .optional()
    .meta({ example: '/v1/chat/completions', description: '请求端点' }),
  content: z.string().optional().meta({ example: 'upstream error', description: '错误摘要' }),
  retry_times: IntSchema.optional().meta({ example: 0, description: '重试次数' }),
  ttfb_milliseconds: IntSchema.optional().meta({ example: 300, description: '首字延迟（毫秒）' }),
  ip: z.string().optional().meta({ example: '127.0.0.1', description: '请求 IP' })
});
export type ChannelLogListItem = z.infer<typeof ChannelLogListItemSchema>;

export const GetChannelLogsResponseSchema = PaginationResponseSchema(ChannelLogListItemSchema);
export type GetChannelLogsResponse = z.infer<typeof GetChannelLogsResponseSchema>;

/* ============================================================================
 * API: 获取模型渠道调用日志详情
 * Route: GET /api/core/ai/channel/logDetail
 * Method: GET
 * Description: 在当前登录成员的渠道范围内获取指定日志请求与响应详情
 * Tags: ['Model', 'Channel', 'Log', 'Read']
 * ============================================================================ */

export const GetChannelLogDetailQuerySchema = z.object({
  channelType: ChannelObservabilityScopeSchema,
  id: IntSchema.meta({ example: 1001, description: '日志 ID' })
});
export type GetChannelLogDetailQuery = z.infer<typeof GetChannelLogDetailQuerySchema>;

export const GetChannelLogDetailResponseSchema = z.object({
  request_body: z.string().optional().meta({ example: '{}', description: '请求体' }),
  response_body: z.string().optional().meta({ example: '{}', description: '响应体' }),
  request_body_truncated: z
    .boolean()
    .optional()
    .meta({ example: false, description: '请求体是否被截断' }),
  response_body_truncated: z
    .boolean()
    .optional()
    .meta({ example: false, description: '响应体是否被截断' })
});
export type GetChannelLogDetailResponse = z.infer<typeof GetChannelLogDetailResponseSchema>;

/* ============================================================================
 * API: 查询模型渠道监控数据
 * Route: GET /api/core/ai/channel/dashboard
 * Method: GET
 * Description: 按当前登录成员推导的渠道范围查询 aiproxy 时序监控数据
 * Tags: ['Model', 'Channel', 'Monitoring', 'Read']
 * ============================================================================ */

export const GetChannelDashboardQuerySchema = z.object({
  channelType: ChannelObservabilityScopeSchema,
  channelId: OptionalIntSchema.meta({ example: 12, description: '渠道 ID；为空表示全部渠道' }),
  model: z.string().optional().meta({ example: 'gpt-4o', description: '上游模型名' }),
  startTimestamp: IntSchema.optional().meta({
    example: 1787500800000,
    description: '查询开始时间（Unix 毫秒）'
  }),
  endTimestamp: IntSchema.optional().meta({
    example: 1787673599999,
    description: '查询结束时间（Unix 毫秒）'
  }),
  timezone: z.string().meta({ example: 'Asia/Shanghai', description: 'IANA 时区名' }),
  timespan: z.enum(['day', 'hour', 'minute']).meta({
    example: 'hour',
    description: '统计粒度'
  })
});
export type GetChannelDashboardQuery = z.infer<typeof GetChannelDashboardQuerySchema>;

export const ChannelDashboardSummarySchema = z.object({
  channel_id: IntSchema.optional().meta({ example: 12, description: '归一化后的渠道 ID' }),
  model: z.string().meta({ example: 'gpt-4o', description: '上游模型名' }),
  request_count: IntSchema.optional().default(0).meta({ example: 10, description: '请求数' }),
  used_amount: z.number().optional().default(0).meta({ example: 1.2, description: '使用金额' }),
  exception_count: IntSchema.optional().default(0).meta({ example: 1, description: '异常请求数' }),
  total_time_milliseconds: IntSchema.optional().default(0).meta({
    example: 10000,
    description: '总请求耗时（毫秒）'
  }),
  total_ttfb_milliseconds: IntSchema.optional().default(0).meta({
    example: 2000,
    description: '总首字延迟（毫秒）'
  }),
  input_tokens: IntSchema.optional()
    .default(0)
    .meta({ example: 1000, description: '输入 Token 数' }),
  output_tokens: IntSchema.optional()
    .default(0)
    .meta({ example: 200, description: '输出 Token 数' }),
  total_tokens: IntSchema.optional().default(0).meta({ example: 1200, description: '总 Token 数' }),
  max_rpm: IntSchema.optional().default(0).meta({ example: 10, description: '最大 RPM' }),
  max_tpm: IntSchema.optional().default(0).meta({ example: 1200, description: '最大 TPM' }),
  cache_hit_count: IntSchema.optional().default(0).meta({ example: 0, description: '缓存命中次数' })
});
export type ChannelDashboardSummary = z.infer<typeof ChannelDashboardSummarySchema>;

export const ChannelDashboardPointSchema = z.object({
  timestamp: IntSchema.meta({ example: 1787666400, description: '时间点（Unix 秒）' }),
  summary: z.array(ChannelDashboardSummarySchema).meta({ description: '该时间点的模型统计' })
});
export type ChannelDashboardPoint = z.infer<typeof ChannelDashboardPointSchema>;

export const GetChannelDashboardResponseSchema = z
  .array(ChannelDashboardPointSchema)
  .meta({ description: '渠道监控时序数据' });
export type GetChannelDashboardResponse = z.infer<typeof GetChannelDashboardResponseSchema>;
