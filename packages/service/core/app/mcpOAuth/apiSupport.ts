import { randomUUID } from 'node:crypto';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { getClientIpFromRequest } from '../../../common/security/clientIp';
import { getLogger, LogCategories } from '../../../common/logger';
import { serviceEnv } from '../../../env';
import { McpOAuthApiError, toApiError } from './errors';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import {
  assertMcpOAuthCallbackByAppRateLimit,
  assertMcpOAuthCallbackByIpRateLimit,
  assertMcpOAuthClientMetadataByIpRateLimit,
  assertMcpOAuthClientResetByAppRateLimit,
  assertMcpOAuthDisconnectByAppRateLimit,
  assertMcpOAuthStartByAppRateLimit,
  assertMcpOAuthStartByUserRateLimit
} from '../../../common/rateLimit/interface/mcpOAuth';
import { buildMcpOAuthCallbackRedirect } from './state';
import { isMcpOAuthInsecureHttpAllowed } from './httpRuntime';

/**
 * 路由公共支持（v2.4 §8.3、§11）。
 *
 * 统一错误 envelope、限流映射、回调跳转白名单、审计脱敏。
 * 禁止记录 state/token/client secret。
 */

const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);

export type McpOAuthRouteConfig = {
  enabled: boolean;
  runtimeEnabled: boolean;
  feDomain: string;
  basePath: string;
  allowInsecureHttp: boolean;
};

export const normalizeMcpOAuthBasePath = (basePath: string | undefined) => {
  const raw = (basePath ?? '').trim();
  if (!raw) return '';
  // NEXT_PUBLIC_BASE_URL 历史上允许配置为绝对 URL；拼接到 FE_DOMAIN 前只保留 pathname，
  // 否则会生成 `/https://host/base/...` 这样的非法回调地址。
  // 配置成 `https://`、`http://[` 等非法绝对 URL 时按“无 base path”降级：
  // 解析异常不能扩散到所有 OAuth 路由（start/callback/client-metadata）变成 500。
  // 注意先按完整 URL 解析再裁尾斜杠，否则 `https://` 会被裁成 `https:` 后绕过绝对 URL 分支。
  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      pathname = '';
    }
  }
  const trimmed = pathname.replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

/** 路由路径常量：回调与 CIMD 元数据必须由同一来源构造，避免重命名后 OAuth 往返失效。 */
export const MCP_OAUTH_CALLBACK_PATH = '/api/core/app/mcpTools/oauth/callback';
export const MCP_OAUTH_CLIENT_METADATA_PATH = '/api/core/app/mcpTools/oauth/client-metadata.json';

export const getMcpOAuthRouteConfig = (): McpOAuthRouteConfig => ({
  enabled: serviceEnv.MCP_OAUTH_ENABLED,
  runtimeEnabled: serviceEnv.MCP_OAUTH_RUNTIME_ENABLED,
  feDomain: serviceEnv.FE_DOMAIN.replace(/\/+$/, ''),
  basePath: normalizeMcpOAuthBasePath(serviceEnv.NEXT_PUBLIC_BASE_URL),
  allowInsecureHttp: isMcpOAuthInsecureHttpAllowed()
});

export const assertMcpOAuthEnabled = () => {
  if (!serviceEnv.MCP_OAUTH_ENABLED) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.disabled, {
      message: 'MCP OAuth is disabled'
    });
  }
};

export const getMcpOAuthRedirectUri = () => {
  const config = getMcpOAuthRouteConfig();
  return `${config.feDomain}${config.basePath}${MCP_OAUTH_CALLBACK_PATH}`;
};

export const getMcpOAuthCimdClientId = () => {
  const config = getMcpOAuthRouteConfig();
  return `${config.feDomain}${config.basePath}${MCP_OAUTH_CLIENT_METADATA_PATH}`;
};

export const getMcpOAuthRequestId = (req: { headers?: Record<string, unknown> }) => {
  const header = req.headers?.['x-request-id'] ?? req.headers?.['request-id'];
  if (typeof header === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(header)) return header;
  return randomUUID();
};

type NodeApiResponseLike = {
  status: (code: number) => NodeApiResponseLike;
  setHeader: (name: string, value: string) => unknown;
  json: (body: unknown) => unknown;
  end: () => unknown;
  writableEnded?: boolean;
  headersSent?: boolean;
};

export const sendMcpOAuthJson = ({
  res,
  status,
  body,
  headers
}: {
  res: NodeApiResponseLike;
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}) => {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers ?? {})) {
    res.setHeader(key, value);
  }
  return res.json(body);
};

export type McpOAuthApiHandler<Req, Res> = (req: Req, res: Res) => Promise<unknown> | unknown;

/**
 * 捕获 `McpOAuthApiError` 并输出 v2.4 统一 envelope；原始响应（302/405/304）直接返回。
 */
export const createMcpOAuthApiHandler =
  <Req extends { headers?: Record<string, unknown> }, Res extends NodeApiResponseLike>(
    handler: McpOAuthApiHandler<Req, Res>
  ) =>
  async (req: Req, res: Res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (res.writableEnded || res.headersSent) return;
      const requestId = getMcpOAuthRequestId(req);
      const apiError =
        error instanceof McpOAuthApiError
          ? error
          : new McpOAuthApiError(McpOAuthErrorCodeEnum.internalError, { cause: error });

      logger.warn('MCP OAuth API failed', {
        requestId,
        oauthCode: apiError.oauthCode,
        retryable: apiError.retryable
      });

      const headers: Record<string, string> = {};
      if (apiError.oauthCode === McpOAuthErrorCodeEnum.rateLimited) {
        headers['Retry-After'] = String(
          Math.max(1, Math.ceil((apiError.retryAfterMs ?? 60_000) / 1000))
        );
      }

      return sendMcpOAuthJson({
        res,
        status: apiError.httpStatus,
        body: toApiError(apiError, requestId),
        headers
      });
    }
  };

export type McpOAuthRateLimitPolicy =
  | 'start-app'
  | 'start-user'
  | 'callback-ip'
  | 'callback-app'
  | 'disconnect-app'
  | 'client-reset-app'
  | 'client-metadata-ip';

const isRateLimitError = (error: unknown) =>
  error === ERROR_ENUM.tooManyRequest ||
  (error instanceof Error && error.message === ERROR_ENUM.tooManyRequest) ||
  (typeof error === 'string' && error === ERROR_ENUM.tooManyRequest);

type McpOAuthRateLimitParams = {
  'start-app': { appId: string };
  'start-user': { tmbId: string };
  'callback-ip': { ip: string | undefined };
  'callback-app': { appId: string };
  'disconnect-app': { appId: string };
  'client-reset-app': { appId: string };
  'client-metadata-ip': { ip: string | undefined };
};

/** 统一把限流错误映射为 `mcp_oauth_rate_limited` + Retry-After。 */
export const assertMcpOAuthRateLimit = async <P extends McpOAuthRateLimitPolicy>(
  policy: P,
  params: McpOAuthRateLimitParams[P]
) => {
  try {
    switch (policy) {
      case 'start-app':
        await assertMcpOAuthStartByAppRateLimit({
          appId: (params as McpOAuthRateLimitParams['start-app']).appId
        });
        break;
      case 'start-user':
        await assertMcpOAuthStartByUserRateLimit({
          tmbId: (params as McpOAuthRateLimitParams['start-user']).tmbId
        });
        break;
      case 'callback-ip': {
        const ip = (params as McpOAuthRateLimitParams['callback-ip']).ip;
        // 无法解析 IP 时不把所有请求压进同一个全局桶（会误伤合法回调）；
        // 回调仍由一次性 state 台账严格兜底。
        if (!ip) break;
        await assertMcpOAuthCallbackByIpRateLimit({ ip });
        break;
      }
      case 'callback-app':
        await assertMcpOAuthCallbackByAppRateLimit({
          appId: (params as McpOAuthRateLimitParams['callback-app']).appId
        });
        break;
      case 'disconnect-app':
        await assertMcpOAuthDisconnectByAppRateLimit({
          appId: (params as McpOAuthRateLimitParams['disconnect-app']).appId
        });
        break;
      case 'client-reset-app':
        await assertMcpOAuthClientResetByAppRateLimit({
          appId: (params as McpOAuthRateLimitParams['client-reset-app']).appId
        });
        break;
      case 'client-metadata-ip': {
        const ip = (params as McpOAuthRateLimitParams['client-metadata-ip']).ip;
        if (!ip) break;
        await assertMcpOAuthClientMetadataByIpRateLimit({ ip });
        break;
      }
    }
  } catch (error) {
    if (isRateLimitError(error)) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.rateLimited, {
        message: 'Too many OAuth requests',
        retryAfterMs: 60_000
      });
    }
    throw error;
  }
};

export const getMcpOAuthClientIp = (
  req: Parameters<typeof getClientIpFromRequest>[0]
): string | undefined => getClientIpFromRequest(req) ?? undefined;

/** 回调 Origin（若存在）必须等于 FE_DOMAIN origin。 */
export const assertMcpOAuthOriginAllowed = ({
  origin,
  feDomain
}: {
  origin?: string;
  feDomain: string;
}) => {
  if (!origin) return;
  let originValue: string;
  let expectedValue: string;
  try {
    originValue = new URL(origin).origin;
    expectedValue = new URL(feDomain).origin;
  } catch {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateInvalid, {
      message: 'OAuth callback origin is invalid'
    });
  }
  if (originValue !== expectedValue) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateInvalid, {
      message: 'OAuth callback origin is not allowed'
    });
  }
};

/**
 * 审计只记录非密摘要；token、state、Cookie、client secret 永远不进入日志。
 */
export const redactMcpOAuthForAudit = ({
  appId,
  nodeId,
  issuer,
  resource,
  clientSource,
  hasToken,
  oauthCode
}: {
  appId?: string;
  nodeId?: string;
  issuer?: string;
  resource?: string;
  clientSource?: string;
  hasToken?: boolean;
  oauthCode?: string;
}) => ({
  appId,
  nodeId,
  issuer,
  resource,
  clientSource,
  hasToken: !!hasToken,
  oauthCode
});

export const logMcpOAuthAuditEvent = (
  event: string,
  details: Parameters<typeof redactMcpOAuthForAudit>[0]
) => {
  logger.info(`MCP OAuth ${event}`, redactMcpOAuthForAudit(details));
};

/**
 * 供回调路由复用；统一从 state 的 appId 构造，禁止使用请求中的任意 URL。
 * basePath 默认取路由配置（Next basePath），保证跳转不丢部署前缀。
 */
export const getMcpOAuthCallbackRedirectFromState = (
  args: Parameters<typeof buildMcpOAuthCallbackRedirect>[0]
) =>
  buildMcpOAuthCallbackRedirect({
    basePath: getMcpOAuthRouteConfig().basePath,
    ...args
  });
