import z from 'zod';

/**
 * MCP 工具集 OAuth 跨端枚举与纯函数。
 *
 * 该文件只放可被前后端、服务层共同引用的常量与无副作用校验，
 * 不依赖 workflow/node 类型，避免与 `node.ts` 形成循环依赖。
 */

/** 节点鉴权模式：默认 headers；oauth 时运行期忽略 headerSecret。 */
export const McpOAuthAuthModeSchema = z.enum(['headers', 'oauth']);
export type McpOAuthAuthMode = z.infer<typeof McpOAuthAuthModeSchema>;

/** 用户偏好；`auto` 固定按 CIMD → DCR → manual 顺序尝试。 */
export const McpOAuthClientModeSchema = z.enum(['auto', 'cimd', 'dcr', 'manual']);
export type McpOAuthClientMode = z.infer<typeof McpOAuthClientModeSchema>;

/** start 成功后写入的实际 client 来源，后续只读。 */
export const McpOAuthClientSourceSchema = z.enum(['cimd', 'dcr', 'manual']);
export type McpOAuthClientSource = z.infer<typeof McpOAuthClientSourceSchema>;

/**
 * 加密 state 的长度上限（base64url 字符）。
 *
 * 构建、解析与回调 query 校验共用同一常量。该值同时受 HTTP 层约束：Node 默认
 * `--max-http-header-size` 为 16KB，常见 nginx `large_client_header_buffers` 为 8KB，
 * 超限 state 会在回调时直接得到 431，根本进不到 query 校验。因此取 8KB 作为头安全值；
 * `buildMcpOAuthState` 在加密前按 payload 最坏长度预校验，宁可让 `/oauth/start`
 * 返回可读错误，也不生成回调必然投递失败的 state。
 */
export const MCP_OAUTH_STATE_MAX_LENGTH = 8 * 1024;

/** status 投影的 8 种状态（v2.4 §8.2），命中优先级由服务层派生。 */
export const McpOAuthStatusEnum = {
  headers: 'headers',
  configError: 'config_error',
  clientMissing: 'client_missing',
  pendingAuthorization: 'pending_authorization',
  authorized: 'authorized',
  refreshDue: 'refresh_due',
  refreshing: 'refreshing',
  reauthRequired: 'reauth_required'
} as const;

/** `McpOAuthStatusEnum` 的取值联合，schema 与类型均从同一来源派生。 */
export type McpOAuthStatus = (typeof McpOAuthStatusEnum)[keyof typeof McpOAuthStatusEnum];

export const MCP_OAUTH_STATUSES = Object.values(McpOAuthStatusEnum) as unknown as readonly [
  McpOAuthStatus,
  ...McpOAuthStatus[]
];

export const McpOAuthStatusSchema = z.enum(MCP_OAUTH_STATUSES);

/**
 * v2.4 §8.3 保留的错误码。
 *
 * 已删除：rollback_blocked / scope_not_allowed / scope_not_configured /
 * scope_escalation / schema_unmigrated / endpoint_origin_mismatch /
 * prm_origin_mismatch / version_conflict / credential_superseded /
 * state_inconsistent / runtime_forbidden / runtime_unavailable。
 */
export const McpOAuthErrorCodeEnum = {
  disabled: 'mcp_oauth_disabled',
  notToolset: 'mcp_oauth_not_toolset',
  appMissing: 'mcp_oauth_app_missing',
  nodeNotFound: 'mcp_oauth_node_not_found',
  nodeAmbiguous: 'mcp_oauth_node_ambiguous',
  nodeTooLarge: 'mcp_oauth_node_too_large',
  notOAuthMode: 'mcp_oauth_not_oauth_mode',
  urlMismatch: 'mcp_oauth_url_mismatch',
  stateMissing: 'mcp_oauth_state_missing',
  stateInvalid: 'mcp_oauth_state_invalid',
  stateExpired: 'mcp_oauth_state_expired',
  stateReplayed: 'mcp_oauth_state_replayed',
  stateCookieMissing: 'mcp_oauth_state_cookie_missing',
  stateBindingMismatch: 'mcp_oauth_state_binding_mismatch',
  stateContextChanged: 'mcp_oauth_state_context_changed',
  stateStorageFailed: 'mcp_oauth_state_storage_failed',
  discoveryFailed: 'mcp_oauth_discovery_failed',
  prmResourceMismatch: 'mcp_oauth_prm_resource_mismatch',
  issuerMismatch: 'mcp_oauth_issuer_mismatch',
  issuerChanged: 'mcp_oauth_issuer_changed',
  endpointInsecure: 'mcp_oauth_endpoint_insecure',
  privateUrl: 'mcp_oauth_private_url',
  proxyForbidden: 'mcp_oauth_proxy_forbidden',
  responseTooLarge: 'mcp_oauth_response_too_large',
  unsupportedFlow: 'mcp_oauth_unsupported_flow',
  cimdUnsupported: 'mcp_oauth_cimd_unsupported',
  cimdUnavailable: 'mcp_oauth_cimd_unavailable',
  registrationUnsupported: 'mcp_oauth_registration_unsupported',
  registrationRejected: 'mcp_oauth_registration_rejected',
  registrationFailed: 'mcp_oauth_registration_failed',
  clientMissing: 'mcp_oauth_client_missing',
  clientRequired: 'mcp_oauth_client_required',
  clientRejected: 'mcp_oauth_client_rejected',
  pkceUnsupported: 'mcp_oauth_pkce_unsupported',
  scopeInvalid: 'mcp_oauth_scope_invalid',
  scopeWidened: 'mcp_oauth_scope_widened',
  accessDenied: 'mcp_oauth_access_denied',
  exchangeFailed: 'mcp_oauth_exchange_failed',
  tokenPersistFailed: 'mcp_oauth_token_persist_failed',
  reauthRequired: 'mcp_oauth_reauth_required',
  insufficientScope: 'mcp_oauth_insufficient_scope',
  refreshTransient: 'mcp_oauth_refresh_transient',
  clientResetFailed: 'mcp_oauth_client_reset_failed',
  conflict: 'mcp_oauth_conflict',
  rateLimited: 'mcp_oauth_rate_limited',
  internalError: 'mcp_oauth_internal_error'
} as const;

export type McpOAuthErrorCode = (typeof McpOAuthErrorCodeEnum)[keyof typeof McpOAuthErrorCodeEnum];

export const MCP_OAUTH_ERROR_CODES = Object.values(McpOAuthErrorCodeEnum) as unknown as readonly [
  McpOAuthErrorCode,
  ...McpOAuthErrorCode[]
];

export const McpOAuthErrorCodeSchema = z.enum(MCP_OAUTH_ERROR_CODES);

/** scope 语法（RFC 6749 §3.3）：空格分隔，token 仅允许可见 ASCII。 */
export const MCP_OAUTH_SCOPE_TOKEN_REGEX = /^[\x21\x23-\x5B\x5D-\x7E]+$/;
export const MCP_OAUTH_SCOPE_MAX_TOKENS = 32;
export const MCP_OAUTH_SCOPE_TOKEN_MAX_LENGTH = 512;

/** 空字符串表示未请求 scope；token 数、单 token 长度与字符集必须全部合法。 */
export const isValidMcpOAuthScope = (scope: string): boolean => {
  if (scope.length === 0) return true;

  const tokens = scope.split(' ');
  if (tokens.length > MCP_OAUTH_SCOPE_MAX_TOKENS) return false;

  return tokens.every(
    (token) =>
      token.length > 0 &&
      token.length <= MCP_OAUTH_SCOPE_TOKEN_MAX_LENGTH &&
      MCP_OAUTH_SCOPE_TOKEN_REGEX.test(token)
  );
};

/**
 * AS 实际授予的 scope 必须是请求 scope 的子集（§5.3）。
 * 未请求时，AS 也不得自行授予任何 scope。
 */
export const isMcpOAuthScopeSubset = (granted: string, requested: string): boolean => {
  if (granted.length === 0) return true;
  if (requested.length === 0) return false;

  const requestedTokens = new Set(requested.split(' '));
  return granted.split(' ').every((token) => requestedTokens.has(token));
};

export const isMcpOAuthAuthMode = (value: unknown): value is McpOAuthAuthMode =>
  McpOAuthAuthModeSchema.safeParse(value).success;
export const isMcpOAuthClientMode = (value: unknown): value is McpOAuthClientMode =>
  McpOAuthClientModeSchema.safeParse(value).success;
export const isMcpOAuthClientSource = (value: unknown): value is McpOAuthClientSource =>
  McpOAuthClientSourceSchema.safeParse(value).success;
export const isMcpOAuthErrorCode = (value: unknown): value is McpOAuthErrorCode =>
  McpOAuthErrorCodeSchema.safeParse(value).success;
