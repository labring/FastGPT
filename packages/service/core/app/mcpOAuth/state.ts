import { createHash, randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret } from '../../../common/secret/aes256gcm';
import { McpOAuthApiError } from './errors';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import { MCP_OAUTH_STATE_PURGE_MS, MCP_OAUTH_STATE_TTL_MS, MongoMcpOAuthState } from './schema';
import {
  McpOAuthStatePayloadSchema,
  type McpOAuthStatePayloadType,
  type McpOAuthStateRecordType
} from './types';

/**
 * state 加密 / 一次性台账 / Cookie 绑定（v2.4 §4）。
 *
 * state 原文只返回给浏览器；任何日志、审计都不得记录 `n`、state 原文或 Cookie。
 */

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

export const MCP_OAUTH_BIND_COOKIE_MAX_AGE_SECONDS = 600;
export const MCP_OAUTH_BIND_COOKIE_PATH = '/api/core/app/mcpTools/oauth';

export const getMcpOAuthBindCookieName = (appId: string) => `mcp_oauth_bind_${appId}`;

export const createMcpOAuthNonce = () => randomBytes(32).toString('base64url');

export type McpOAuthStateBuildResult = {
  state: string;
  payload: McpOAuthStatePayloadType;
  stateHash: string;
  expiresAt: number;
};

/**
 * 加密 state：AES-256-GCM 密文（`iv:encrypted:tag`）→ base64url。
 * `exp` 使用 epoch ms，与台账 `expiresAt` 同源。
 */
export const buildMcpOAuthState = ({
  appId,
  nodeId,
  teamId,
  tmbId,
  redirectUri,
  codeVerifier,
  issuer,
  resource,
  scope,
  clientIdHash,
  ttlMs = MCP_OAUTH_STATE_TTL_MS,
  now = Date.now()
}: Omit<McpOAuthStatePayloadType, 'v' | 'n' | 'exp'> & {
  ttlMs?: number;
  now?: number;
}): McpOAuthStateBuildResult => {
  const nonce = createMcpOAuthNonce();
  const payload: McpOAuthStatePayloadType = {
    v: 1,
    n: nonce,
    appId,
    nodeId,
    teamId,
    tmbId,
    redirectUri,
    codeVerifier,
    issuer,
    resource,
    ...(scope !== undefined ? { scope } : {}),
    clientIdHash,
    exp: now + ttlMs
  };

  const encrypted = encryptSecret(JSON.stringify(payload));
  const state = Buffer.from(encrypted, 'utf8').toString('base64url');

  return {
    state,
    payload,
    stateHash: sha256Hex(nonce),
    expiresAt: payload.exp
  };
};

/** 解密并校验 state；任何失败都收敛为 `state_invalid` / `state_expired`。 */
export const parseMcpOAuthState = (
  state: string,
  { now = Date.now() }: { now?: number } = {}
): McpOAuthStatePayloadType => {
  if (!state || state.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(state)) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateInvalid, {
      message: 'OAuth state is malformed'
    });
  }

  let decrypted: string;
  try {
    decrypted = decryptSecret(Buffer.from(state, 'base64url').toString('utf8'));
  } catch {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateInvalid, {
      message: 'OAuth state cannot be decrypted'
    });
  }

  let json: unknown;
  try {
    json = JSON.parse(decrypted);
  } catch {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateInvalid, {
      message: 'OAuth state payload is not JSON'
    });
  }

  const parsed = McpOAuthStatePayloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateInvalid, {
      message: 'OAuth state payload is invalid'
    });
  }

  if (parsed.data.exp <= now) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateExpired, {
      message: 'OAuth state has expired'
    });
  }

  return parsed.data;
};

/**
 * 写台账；先写台账再返回授权 URL。写失败 → `state_storage_failed`。
 */
export const writeMcpOAuthState = async ({
  payload,
  bindCookieHash,
  now = Date.now()
}: {
  payload: McpOAuthStatePayloadType;
  bindCookieHash: string;
  now?: number;
}): Promise<{ stateHash: string }> => {
  const stateHash = sha256Hex(payload.n);
  try {
    await MongoMcpOAuthState.create({
      _id: stateHash,
      v: payload.v,
      appId: payload.appId,
      teamId: payload.teamId,
      nodeId: payload.nodeId,
      tmbId: payload.tmbId,
      bindCookieHash,
      issuer: payload.issuer,
      resource: payload.resource,
      clientIdHash: payload.clientIdHash,
      redirectUri: payload.redirectUri,
      createdAt: new Date(now),
      expiresAt: new Date(payload.exp),
      purgeAt: new Date(now + MCP_OAUTH_STATE_PURGE_MS)
    });
  } catch (error) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateStorageFailed, {
      message: 'Failed to persist OAuth state',
      cause: error
    });
  }

  return { stateHash };
};

/** 同一 app/node/user 的新 start 先作废旧 state（v2.4 §4.2）。 */
export const expirePendingMcpOAuthStates = async ({
  appId,
  nodeId,
  tmbId,
  now = Date.now()
}: {
  appId: string;
  nodeId: string;
  tmbId: string;
  now?: number;
}): Promise<void> => {
  await MongoMcpOAuthState.updateMany(
    { appId, nodeId, tmbId, consumedAt: { $exists: false } },
    { $set: { consumedAt: new Date(now), purgeAt: new Date(now) } }
  );
};

/**
 * 原子消费：`{new:false}` 返回消费前文档；未命中时区分 invalid/replayed/expired。
 */
export const consumeMcpOAuthState = async ({
  stateHash,
  now = Date.now()
}: {
  stateHash: string;
  now?: number;
}): Promise<McpOAuthStateRecordType> => {
  const consumed = await MongoMcpOAuthState.findOneAndUpdate(
    {
      _id: stateHash,
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date(now) }
    },
    { $set: { consumedAt: new Date(now) } },
    { new: false }
  ).lean();

  if (consumed) return consumed as McpOAuthStateRecordType;

  const existing = await MongoMcpOAuthState.findById(stateHash).lean();
  if (!existing) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateInvalid, {
      message: 'OAuth state was not found'
    });
  }
  if (existing.consumedAt) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateReplayed, {
      message: 'OAuth state was already used'
    });
  }
  throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateExpired, {
    message: 'OAuth state has expired'
  });
};

export const serializeMcpOAuthBindCookie = ({
  appId,
  value,
  feDomain
}: {
  appId: string;
  value: string;
  feDomain: string;
}) => {
  const secure = feDomain.startsWith('https://') ? '; Secure' : '';
  return `${getMcpOAuthBindCookieName(appId)}=${value}; Path=${MCP_OAUTH_BIND_COOKIE_PATH}; Max-Age=${MCP_OAUTH_BIND_COOKIE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
};

export const clearMcpOAuthBindCookie = ({
  appId,
  feDomain
}: {
  appId: string;
  feDomain: string;
}) => {
  const secure = feDomain.startsWith('https://') ? '; Secure' : '';
  return `${getMcpOAuthBindCookieName(appId)}=; Path=${MCP_OAUTH_BIND_COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
};

export const readCookie = (cookieHeader: string | undefined, name: string): string | undefined => {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return undefined;
};

/** Cookie 缺失 → `state_cookie_missing`；哈希不一致 → `state_binding_mismatch`。 */
export const assertMcpOAuthBindCookie = ({
  cookieHeader,
  appId,
  bindCookieHash
}: {
  cookieHeader: string | undefined;
  appId: string;
  bindCookieHash: string;
}): void => {
  const cookieValue = readCookie(cookieHeader, getMcpOAuthBindCookieName(appId));
  if (!cookieValue) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateCookieMissing, {
      message: 'OAuth binding cookie is missing'
    });
  }
  if (sha256Hex(cookieValue) !== bindCookieHash) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.stateBindingMismatch, {
      message: 'OAuth binding cookie does not match'
    });
  }
};

/**
 * 回调后的浏览器跳转只允许 `${FE_DOMAIN}/app/detail`，参数只允许
 * `appId` / `oauth` / `code`；`appId` 来自已解密 state。
 */
export const buildMcpOAuthCallbackRedirect = ({
  feDomain,
  appId,
  success,
  code
}: {
  feDomain: string;
  appId: string;
  success: boolean;
  code?: string;
}) => {
  const url = new URL('/app/detail', feDomain);
  url.searchParams.set('appId', appId);
  if (success) {
    url.searchParams.set('oauth', 'success');
  } else {
    url.searchParams.set('oauth', 'error');
    if (code && /^[A-Za-z0-9_]{1,64}$/.test(code)) {
      url.searchParams.set('code', code);
    }
  }
  return url.toString();
};

export const isMcpOAuthCallbackRedirectAllowed = (url: string, feDomain: string): boolean => {
  try {
    const target = new URL(url);
    const expected = new URL('/app/detail', feDomain);
    if (target.origin !== expected.origin || target.pathname !== expected.pathname) return false;
    const allowedParams = new Set(['appId', 'oauth', 'code']);
    for (const key of target.searchParams.keys()) {
      if (!allowedParams.has(key)) return false;
    }
    return true;
  } catch {
    return false;
  }
};
