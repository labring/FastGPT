import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import {
  McpOAuthAuthModeSchema,
  McpOAuthClientModeSchema,
  McpOAuthClientSourceSchema,
  McpOAuthErrorCodeSchema,
  McpOAuthStatusSchema
} from '../../../../core/app/tool/mcpTool/oauth';

/**
 * MCP 工具集 OAuth 路由的请求/响应契约（v2.4 §8）。
 *
 * 该文件只声明契约，不包含任何路由实现；所有路由统一使用
 * `createMcpOAuthApiHandler` 输出 `McpOAuthErrorResponseSchema`。
 */

/** clientMode=manual 时由用户提供的 client 信息；secret 只提交给后端，不回显。 */
export const McpOAuthManualClientSchema = z.object({
  clientId: z.string().min(1).max(2048),
  clientSecret: z.string().min(1).max(4096).optional(),
  tokenEndpointAuthMethod: z
    .enum(['none', 'client_secret_post', 'client_secret_basic'])
    .default('client_secret_basic')
});
export type McpOAuthManualClientType = z.infer<typeof McpOAuthManualClientSchema>;

export const McpOAuthStartBodySchema = z.object({
  appId: ObjectIdSchema,
  nodeId: z.string().min(1).max(64).optional(),
  clientMode: McpOAuthClientModeSchema.default('auto'),
  scope: z.string().max(1024).optional(),
  /** 仅 clientMode=manual 或 auto 最后一步使用。 */
  manualClient: McpOAuthManualClientSchema.optional()
});
export type McpOAuthStartBodyType = z.infer<typeof McpOAuthStartBodySchema>;

export const McpOAuthStartResponseSchema = z.object({
  schemaVersion: z.literal(1),
  authorizationUrl: z.string(),
  clientMode: McpOAuthClientModeSchema,
  clientSource: McpOAuthClientSourceSchema,
  issuer: z.string(),
  resource: z.string(),
  requestedScope: z.string().optional(),
  expiresAt: z.number()
});
export type McpOAuthStartResponseType = z.infer<typeof McpOAuthStartResponseSchema>;

/** 授权服务器 302 回调参数；`error` 与 `code` 互斥，由路由按 AS 响应判定。 */
export const McpOAuthCallbackQuerySchema = z.object({
  state: z.string().min(1).max(4096),
  code: z.string().min(1).max(4096).optional(),
  error: z.string().max(256).optional(),
  error_description: z.string().max(1024).optional(),
  /** RFC 9207；存在时必须与 state 中的 issuer 精确一致。 */
  iss: z.string().max(2048).optional()
});
export type McpOAuthCallbackQueryType = z.infer<typeof McpOAuthCallbackQuerySchema>;

export const McpOAuthStatusQuerySchema = z.object({
  appId: ObjectIdSchema,
  nodeId: z.string().min(1).max(64).optional()
});
export type McpOAuthStatusQueryType = z.infer<typeof McpOAuthStatusQuerySchema>;

export const McpOAuthStatusLastErrorSchema = z.object({
  code: McpOAuthErrorCodeSchema,
  message: z.string().max(256),
  retryable: z.boolean(),
  at: z.number(),
  nextRetryAt: z.number().optional()
});
export type McpOAuthStatusLastErrorType = z.infer<typeof McpOAuthStatusLastErrorSchema>;

export const McpOAuthStatusResponseSchema = z.object({
  schemaVersion: z.literal(1),
  state: McpOAuthStatusSchema,
  authMode: McpOAuthAuthModeSchema,
  clientMode: McpOAuthClientModeSchema,
  clientSource: McpOAuthClientSourceSchema.nullable(),
  issuer: z.string().nullable(),
  resource: z.string().nullable(),
  /** 已授予 scope。 */
  scope: z.string().nullable(),
  requestedScope: z.string().nullable(),
  authorized: z.boolean(),
  hasAccessToken: z.boolean(),
  hasRefreshToken: z.boolean(),
  hasClientSecret: z.boolean(),
  expiresAt: z.number().nullable(),
  refreshDueAt: z.number().nullable(),
  authorizedAt: z.number().nullable(),
  authorizedBy: z.string().nullable(),
  lastError: McpOAuthStatusLastErrorSchema.nullable(),
  canStart: z.boolean(),
  canDisconnect: z.boolean(),
  canResetClient: z.boolean(),
  updatedAt: z.number()
});
export type McpOAuthStatusResponseType = z.infer<typeof McpOAuthStatusResponseSchema>;

/** 按节点确认的动作（断开 / 重置 client）共用同一契约，避免两份 schema 漂移。 */
export const McpOAuthNodeConfirmBodySchema = z.object({
  appId: ObjectIdSchema,
  nodeId: z.string().min(1).max(64).optional(),
  confirm: z.literal(true)
});

export const McpOAuthDisconnectBodySchema = McpOAuthNodeConfirmBodySchema;
export type McpOAuthDisconnectBodyType = z.infer<typeof McpOAuthDisconnectBodySchema>;

export const McpOAuthDisconnectResponseSchema = z.object({
  schemaVersion: z.literal(1),
  disconnected: z.boolean(),
  revoked: z.boolean(),
  revokeError: z.string().nullable()
});
export type McpOAuthDisconnectResponseType = z.infer<typeof McpOAuthDisconnectResponseSchema>;

export const McpOAuthClientResetBodySchema = McpOAuthNodeConfirmBodySchema;
export type McpOAuthClientResetBodyType = z.infer<typeof McpOAuthClientResetBodySchema>;

export const McpOAuthClientResetResponseSchema = z.object({
  schemaVersion: z.literal(1),
  reset: z.boolean(),
  deregistered: z.boolean()
});
export type McpOAuthClientResetResponseType = z.infer<typeof McpOAuthClientResetResponseSchema>;

export const McpOAuthErrorDataSchema = z.object({
  oauthCode: McpOAuthErrorCodeSchema,
  requestId: z.string(),
  retryable: z.boolean(),
  retryAfterMs: z.number().nullable()
});
export type McpOAuthErrorDataType = z.infer<typeof McpOAuthErrorDataSchema>;

/** OAuth 路由统一错误 envelope（v2.4 §8.3）；不改全局 response 处理。 */
export const McpOAuthErrorResponseSchema = z.object({
  code: z.number(),
  statusText: z.literal('error'),
  message: z.string(),
  data: McpOAuthErrorDataSchema
});
export type McpOAuthErrorResponseType = z.infer<typeof McpOAuthErrorResponseSchema>;
