import z from 'zod';
import { SecretValueTypeSchema, StoreSecretValueTypeSchema } from '../../../../common/secret/type';
import {
  McpOAuthClientModeSchema,
  McpOAuthClientSourceSchema,
  McpOAuthErrorCodeSchema,
  isValidMcpOAuthScope
} from './oauth';

/**
 * MCP 工具集 OAuth 存储字段的唯一来源（v2.4 §2.2）。
 *
 * 明确不存在：`mode`、`rollback`、`credentialVersion`、`refreshBackoff`、
 * `server.configHash`、`scopeAllowlist`。任何代码不得读取或写入这些键。
 */

/** 同步 URL 形状校验；DNS/私网检查仍由写路径的 assertMcpOAuthUrlSafe 负责。 */
export const isValidMcpOAuthEndpointUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
};

export const McpOAuthUrlSchema = z
  .string()
  .max(2048)
  .refine(isValidMcpOAuthEndpointUrl, { message: 'mcp_oauth_endpoint_insecure' });

/**
 * 可选字段读侧兼容：历史/第三方数据可能把可选字段写成 `null`（典型来源是 AS metadata
 * 中的 `client_id_metadata_document_supported: null`），而旧契约只允许 `undefined` 或值本身。
 *
 * 这里只放宽读侧（`.nullish()`），不引入 transform：该 schema 参与 OpenAPI 响应文档生成，
 * transform 会被 zod-openapi 拒绝。写路径（discovery）负责把 null 归一为 undefined。
 */
export const McpOAuthServerMetadataSchema = z.object({
  issuer: McpOAuthUrlSchema,
  authorizationEndpoint: McpOAuthUrlSchema,
  tokenEndpoint: McpOAuthUrlSchema,
  registrationEndpoint: McpOAuthUrlSchema.nullish(),
  revocationEndpoint: McpOAuthUrlSchema.nullish(),
  tokenEndpointAuthMethodsSupported: z.array(z.string().max(64)).max(16).nullish(),
  codeChallengeMethodsSupported: z.array(z.string().max(32)).max(16).nullish(),
  clientIdMetadataDocumentSupported: z.boolean().nullish(),
  scopesSupported: z.array(z.string().max(256)).max(64).nullish(),
  source: z.enum(['discovered', 'manual']).default('discovered'),
  fetchedAt: z.number()
});
export type McpOAuthServerMetadataType = z.infer<typeof McpOAuthServerMetadataSchema>;

export const McpOAuthClientSchema = z.object({
  clientId: z.string().min(1).max(2048),
  /** 加密保存；manual 或 DCR 的 client secret。 */
  clientSecret: SecretValueTypeSchema.optional(),
  tokenEndpointAuthMethod: z.enum(['none', 'client_secret_post', 'client_secret_basic']),
  registeredAt: z.number().optional(),
  /** RFC 7592 注册客户端管理地址。 */
  registrationClientUri: McpOAuthUrlSchema.optional(),
  /** RFC 7592 注册访问令牌，加密保存。 */
  registrationAccessToken: SecretValueTypeSchema.optional()
});
export type McpOAuthClientType = z.infer<typeof McpOAuthClientSchema>;

export const McpOAuthTokenSchema = z.object({
  /** { access_token: { secret }, refresh_token?: { secret } } */
  secret: StoreSecretValueTypeSchema,
  tokenType: z.string().max(32).optional(),
  /** AS 实际授予的 scope。 */
  scope: z.string().max(1024).optional(),
  /** epoch ms；0 表示 AS 未给 expires_in。 */
  expiresAt: z.number(),
  obtainedAt: z.number()
});
export type McpOAuthTokenType = z.infer<typeof McpOAuthTokenSchema>;

export const McpOAuthLastErrorSchema = z.object({
  code: McpOAuthErrorCodeSchema,
  at: z.number(),
  retryable: z.boolean(),
  retryAfterMs: z.number().min(0).max(86_400_000).optional()
});
export type McpOAuthLastErrorType = z.infer<typeof McpOAuthLastErrorSchema>;

export const McpOAuthLeaseSchema = z.object({
  owner: z.string().max(64),
  expiresAt: z.number()
});
export type McpOAuthLeaseType = z.infer<typeof McpOAuthLeaseSchema>;

export const McpToolSetOAuthConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  clientMode: McpOAuthClientModeSchema.default('auto'),
  clientSource: McpOAuthClientSourceSchema.optional(),
  issuer: McpOAuthUrlSchema.optional(),
  resource: McpOAuthUrlSchema.optional(),
  /** 请求值；默认未设置。 */
  scope: z
    .string()
    .max(1024)
    .refine(isValidMcpOAuthScope, { message: 'mcp_oauth_scope_invalid' })
    .optional(),
  /** 发现结果缓存（端点与能力），非密。 */
  server: McpOAuthServerMetadataSchema.optional(),
  client: McpOAuthClientSchema.optional(),
  token: McpOAuthTokenSchema.optional(),
  /** 唯一 fencing token；每次凭证变更 +1；缺省 0。 */
  credentialSeq: z.number().int().nonnegative().default(0),
  refreshLease: McpOAuthLeaseSchema.nullish(),
  revokeLease: McpOAuthLeaseSchema.nullish(),
  lastError: McpOAuthLastErrorSchema.nullish(),
  authorizedAt: z.number().optional(),
  authorizedBy: z.string().max(64).optional()
});
export type McpToolSetOAuthConfigType = z.infer<typeof McpToolSetOAuthConfigSchema>;
