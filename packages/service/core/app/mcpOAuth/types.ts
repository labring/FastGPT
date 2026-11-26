import z from 'zod';
import type { McpOAuthClientSource } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import type { McpOAuthServerMetadataType } from '@fastgpt/global/core/app/tool/mcpTool/oauthConfig';

/**
 * MCP OAuth 服务内部类型。
 *
 * 这里只放跨模块复用的结构；业务逻辑在 discovery/registration/state/token 等模块。
 */

/** 加密 state 内的载荷；`n`、state 原文禁止写入日志。 */
export const McpOAuthStatePayloadSchema = z.object({
  v: z.literal(1),
  n: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  appId: z.string().regex(/^[a-f0-9]{24}$/i),
  nodeId: z.string().min(1).max(64),
  teamId: z.string().regex(/^[a-f0-9]{24}$/i),
  tmbId: z.string().regex(/^[a-f0-9]{24}$/i),
  redirectUri: z.string().max(2048),
  codeVerifier: z.string().regex(/^[A-Za-z0-9\-._~]{43,128}$/),
  issuer: z.string().max(2048),
  resource: z.string().max(2048),
  scope: z.string().max(1024).optional(),
  clientIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  exp: z.number()
});
export type McpOAuthStatePayloadType = z.infer<typeof McpOAuthStatePayloadSchema>;

/** `mcp_oauth_states` 一次性台账记录；`_id = sha256(nonce)`。 */
export type McpOAuthStateRecordType = {
  _id: string;
  v: number;
  appId: string;
  teamId: string;
  nodeId: string;
  tmbId: string;
  bindCookieHash: string;
  issuer: string;
  resource: string;
  clientIdHash: string;
  redirectUri: string;
  createdAt: Date;
  expiresAt: Date;
  purgeAt: Date;
  consumedAt?: Date;
  /**
   * 本次授权尝试实际使用的 client 来源（可选）。
   *
   * 只用于判定「上一次 auto 选的 CIMD 没有走完」：该字段缺失（旧台账）时
   * 一律视为来源未知，不会触发自动降级。
   */
  clientSource?: McpOAuthClientSource;
  /**
   * 该 CIMD attempt 已触发过一次「自动降级 DCR」；同一条台账只降级一次，
   * 避免重复 start 在 CIMD/DCR 之间来回抖动。
   */
  downgradedAt?: Date;
};

/** 发现结果缓存：写回 `oauth.server`，并与授权流程共享 issuer/resource。 */
export type McpOAuthDiscoveryResult = {
  server: McpOAuthServerMetadataType;
  issuer: string;
  resource: string;
  scope?: string;
};
