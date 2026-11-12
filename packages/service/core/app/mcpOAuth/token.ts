import z from 'zod';
import {
  isMcpOAuthScopeSubset,
  isValidMcpOAuthScope
} from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import type { McpOAuthTokenType } from '@fastgpt/global/core/app/tool/mcpTool/oauthConfig';
import { encryptSecretValue, decryptSecretValue } from '../../../common/secret/utils';
import { McpOAuthApiError } from './errors';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import { requestMcpOAuthHttp } from './httpRuntime';

/**
 * 令牌交换 / 刷新 / 撤销（v2.4 §6）。
 *
 * 不记录令牌旋转日志：刷新失败按 `invalid_grant` → 重新授权处理。
 * 所有 token 只以密文进入 `oauth.token.secret`。
 */

export const MCP_OAUTH_REFRESH_MARGIN_MS = 30 * 1000;

type Flavor = 'exchange' | 'refresh';

const TokenResponseSchema = z
  .object({
    access_token: z
      .string()
      .min(1)
      .max(16 * 1024),
    token_type: z.string().min(1).max(64),
    expires_in: z.number().nonnegative().max(31_536_000).optional(),
    refresh_token: z
      .string()
      .min(1)
      .max(16 * 1024)
      .optional(),
    scope: z.string().max(4096).optional()
  })
  .passthrough();

const OAuthErrorBodySchema = z
  .object({
    error: z.string().max(256).optional(),
    error_description: z.string().max(1024).optional()
  })
  .passthrough();

const parseRetryAfterMs = (headers: Headers): number | undefined => {
  const raw = headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 86_400_000);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 86_400_000));
  return undefined;
};

const parseErrorCode = (body: string): string | undefined => {
  try {
    const parsed = OAuthErrorBodySchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data.error : undefined;
  } catch {
    return undefined;
  }
};

const tokenErrorCode = (flavor: Flavor, oauthError: string | undefined) => {
  if (oauthError === 'invalid_grant') return McpOAuthErrorCodeEnum.reauthRequired;
  if (oauthError === 'invalid_client') return McpOAuthErrorCodeEnum.clientRejected;
  if (oauthError === 'insufficient_scope') return McpOAuthErrorCodeEnum.insufficientScope;
  return flavor === 'refresh'
    ? McpOAuthErrorCodeEnum.refreshTransient
    : McpOAuthErrorCodeEnum.exchangeFailed;
};

export const buildMcpOAuthClientAuth = ({
  clientId,
  clientSecret,
  authMethod
}: {
  clientId: string;
  clientSecret?: string;
  authMethod: 'none' | 'client_secret_post' | 'client_secret_basic';
}): { bodyParams: Record<string, string>; headers: Record<string, string> } => {
  if (authMethod === 'client_secret_basic') {
    if (!clientSecret) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.clientRequired, {
        message: 'Client secret is required for client_secret_basic'
      });
    }
    const credentials = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`;
    return {
      bodyParams: {},
      headers: {
        authorization: `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`
      }
    };
  }

  if (authMethod === 'client_secret_post') {
    if (!clientSecret) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.clientRequired, {
        message: 'Client secret is required for client_secret_post'
      });
    }
    return {
      bodyParams: { client_id: clientId, client_secret: clientSecret },
      headers: {}
    };
  }

  return { bodyParams: { client_id: clientId }, headers: {} };
};

const postTokenEndpoint = async ({
  tokenEndpoint,
  params,
  authMethod,
  clientId,
  clientSecret,
  flavor,
  timeoutMs
}: {
  tokenEndpoint: string;
  params: Record<string, string>;
  authMethod: 'none' | 'client_secret_post' | 'client_secret_basic';
  clientId: string;
  clientSecret?: string;
  flavor: Flavor;
  timeoutMs?: number;
}): Promise<Record<string, unknown>> => {
  const auth = buildMcpOAuthClientAuth({ clientId, clientSecret, authMethod });
  const body = new URLSearchParams({ ...params, ...auth.bodyParams }).toString();

  const response = await requestMcpOAuthHttp({
    url: tokenEndpoint,
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      ...auth.headers
    },
    body,
    timeoutMs,
    networkErrorCode:
      flavor === 'refresh'
        ? McpOAuthErrorCodeEnum.refreshTransient
        : McpOAuthErrorCodeEnum.exchangeFailed
  });

  if (response.status === 429 || response.status >= 500) {
    const retryAfterMs = parseRetryAfterMs(response.headers);
    throw new McpOAuthApiError(
      flavor === 'refresh'
        ? McpOAuthErrorCodeEnum.refreshTransient
        : McpOAuthErrorCodeEnum.exchangeFailed,
      { message: `Token endpoint returned ${response.status}`, retryAfterMs }
    );
  }

  if (response.status < 200 || response.status >= 300) {
    const oauthError = parseErrorCode(response.body);
    throw new McpOAuthApiError(tokenErrorCode(flavor, oauthError), {
      message: oauthError
        ? `Token endpoint error: ${oauthError}`
        : `Token endpoint returned ${response.status}`,
      retryAfterMs: parseRetryAfterMs(response.headers)
    });
  }

  try {
    return JSON.parse(response.body) as Record<string, unknown>;
  } catch {
    throw new McpOAuthApiError(
      flavor === 'refresh'
        ? McpOAuthErrorCodeEnum.refreshTransient
        : McpOAuthErrorCodeEnum.exchangeFailed,
      { message: 'Token response is not JSON' }
    );
  }
};

/**
 * 校验 token 响应并构造存储结构。`previousRefreshSecret` 用于 AS 未轮换 RT 时保留旧密文。
 */
const buildTokenRecord = ({
  json,
  requestedScope,
  now,
  previousRefreshSecret
}: {
  json: Record<string, unknown>;
  requestedScope?: string;
  now: number;
  previousRefreshSecret?: McpOAuthTokenType['secret']['refresh_token'];
}): McpOAuthTokenType => {
  const parsed = TokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.exchangeFailed, {
      message: 'Token response is invalid'
    });
  }

  if (parsed.data.token_type.toLowerCase() !== 'bearer') {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.exchangeFailed, {
      message: 'Token type is not Bearer'
    });
  }

  const grantedScope = parsed.data.scope;
  if (grantedScope !== undefined) {
    if (!isValidMcpOAuthScope(grantedScope)) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.scopeInvalid, {
        message: 'Granted scope syntax is invalid'
      });
    }
    // 未请求 scope 时（未配置或刷新）AS 返回默认 scope 是合法的；只有显式请求才做子集校验。
    if (requestedScope && !isMcpOAuthScopeSubset(grantedScope, requestedScope)) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.scopeWidened, {
        message: 'Authorization server widened the granted scope'
      });
    }
  }

  const accessSecret = encryptSecretValue({ value: parsed.data.access_token });
  const refreshSecret = parsed.data.refresh_token
    ? encryptSecretValue({ value: parsed.data.refresh_token })
    : previousRefreshSecret;

  return {
    secret: {
      access_token: accessSecret,
      ...(refreshSecret ? { refresh_token: refreshSecret } : {})
    },
    tokenType: parsed.data.token_type,
    ...(grantedScope !== undefined ? { scope: grantedScope } : {}),
    expiresAt:
      parsed.data.expires_in !== undefined ? now + Math.floor(parsed.data.expires_in * 1000) : 0,
    obtainedAt: now
  };
};

export const exchangeMcpOAuthAuthorizationCode = async ({
  tokenEndpoint,
  clientId,
  clientSecret,
  authMethod,
  code,
  redirectUri,
  codeVerifier,
  resource,
  requestedScope,
  timeoutMs,
  now = Date.now()
}: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  authMethod: 'none' | 'client_secret_post' | 'client_secret_basic';
  code: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
  requestedScope?: string;
  timeoutMs?: number;
  now?: number;
}): Promise<McpOAuthTokenType> => {
  const json = await postTokenEndpoint({
    tokenEndpoint,
    params: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      ...(resource ? { resource } : {})
    },
    authMethod,
    clientId,
    clientSecret,
    flavor: 'exchange',
    timeoutMs
  });

  return buildTokenRecord({ json, requestedScope, now });
};

/**
 * 刷新；不发送 scope。AS 未返回新 RT 时保留旧 refresh token 密文。
 */
export const refreshMcpOAuthAccessToken = async ({
  tokenEndpoint,
  clientId,
  clientSecret,
  authMethod,
  refreshToken,
  resource,
  requestedScope,
  previousToken,
  timeoutMs,
  now = Date.now()
}: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  authMethod: 'none' | 'client_secret_post' | 'client_secret_basic';
  refreshToken: string;
  resource?: string;
  requestedScope?: string;
  previousToken?: McpOAuthTokenType;
  timeoutMs?: number;
  now?: number;
}): Promise<McpOAuthTokenType> => {
  const json = await postTokenEndpoint({
    tokenEndpoint,
    params: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      ...(resource ? { resource } : {})
    },
    authMethod,
    clientId,
    clientSecret,
    flavor: 'refresh',
    timeoutMs
  });

  return buildTokenRecord({
    json,
    requestedScope,
    now,
    previousRefreshSecret: previousToken?.secret.refresh_token
  });
};

/**
 * RFC 7009 撤销；best effort，返回是否成功。
 */
export const revokeMcpOAuthToken = async ({
  revocationEndpoint,
  clientId,
  clientSecret,
  authMethod,
  token,
  tokenTypeHint,
  timeoutMs = 3000
}: {
  revocationEndpoint: string;
  clientId: string;
  clientSecret?: string;
  authMethod: 'none' | 'client_secret_post' | 'client_secret_basic';
  token: string;
  tokenTypeHint?: 'access_token' | 'refresh_token';
  timeoutMs?: number;
}): Promise<boolean> => {
  try {
    const auth = buildMcpOAuthClientAuth({ clientId, clientSecret, authMethod });
    const body = new URLSearchParams({
      token,
      ...(tokenTypeHint ? { token_type_hint: tokenTypeHint } : {}),
      ...auth.bodyParams
    }).toString();
    const response = await requestMcpOAuthHttp({
      url: revocationEndpoint,
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        ...auth.headers
      },
      body,
      timeoutMs,
      networkErrorCode: McpOAuthErrorCodeEnum.clientResetFailed
    });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
};

export const decryptMcpOAuthAccessToken = (token?: McpOAuthTokenType): string | undefined => {
  const value = token?.secret?.access_token;
  if (!value) return undefined;
  const decrypted = decryptSecretValue(value);
  return typeof decrypted === 'string' && decrypted ? decrypted : undefined;
};

export const decryptMcpOAuthRefreshToken = (token?: McpOAuthTokenType): string | undefined => {
  const value = token?.secret?.refresh_token;
  if (!value) return undefined;
  const decrypted = decryptSecretValue(value);
  return typeof decrypted === 'string' && decrypted ? decrypted : undefined;
};

/** expiresAt=0 表示 AS 未给有效期，按“不可预判”处理：只在 401 时刷新。 */
export const isMcpOAuthAccessTokenUsable = (
  token: McpOAuthTokenType | undefined,
  {
    now = Date.now(),
    marginMs = MCP_OAUTH_REFRESH_MARGIN_MS
  }: { now?: number; marginMs?: number } = {}
) => {
  if (!token) return false;
  if (!decryptMcpOAuthAccessToken(token)) return false;
  if (token.expiresAt === 0) return true;
  return token.expiresAt - now > marginMs;
};
