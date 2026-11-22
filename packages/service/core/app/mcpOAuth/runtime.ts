import { randomUUID } from 'node:crypto';
import type {
  McpOAuthLastErrorType,
  McpOAuthTokenType
} from '@fastgpt/global/core/app/tool/mcpTool/oauthConfig';
import { getSecretValue, decryptSecretValue } from '../../../common/secret/utils';
import { MongoAppVersion } from '../version/schema';
import { McpOAuthApiError } from './errors';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import {
  getMcpToolSetVersionDoc,
  getNodeMcpToolSet,
  getToolSetNodes,
  resolveMcpOAuthNode,
  seqMatch,
  updateMcpOAuthNodeFields
} from './credential';
import {
  decryptMcpOAuthAccessToken,
  decryptMcpOAuthRefreshToken,
  isMcpOAuthAccessTokenUsable,
  refreshMcpOAuthAccessToken,
  revokeMcpOAuthToken
} from './token';
import { MCP_OAUTH_REFRESH_LEASE_MS } from './schema';
import { MCP_OAUTH_HTTP_TIMEOUT_MS } from './httpRuntime';
import { getMcpOAuthChallenge, getMcpTransportHttpStatus } from '../mcpAuthError';

/**
 * 运行期令牌解析（v2.4 §6.2–§6.4）。
 *
 * - 进程内 single-flight（Map）避免同实例重复刷新。
 * - Mongo 短租约串行化跨实例刷新；写回同时匹配 seq 与 lease owner。
 * - 401 只强制刷新并重试一次；403 + insufficient_scope 不刷新。
 */

/**
 * 等待并发刷新者写回的预算必须覆盖一次 token 端点请求的最长耗时，
 * 否则持有租约的一方仍在请求中，等待方会提前抛 `refresh_transient`。
 */
export const MCP_OAUTH_LEASE_WAIT_MARGIN_MS = 1000;
export const MCP_OAUTH_LEASE_WAIT_MS = MCP_OAUTH_HTTP_TIMEOUT_MS + MCP_OAUTH_LEASE_WAIT_MARGIN_MS;
export const MCP_OAUTH_LEASE_POLL_MS = 100;
/**
 * 并发刷新等待的轮询上限：从 100ms 起指数退避到 1s，避免 11s 预算内产生上百次
 * Mongo 读取（100ms 固定间隔最坏约 110 次）。
 */
export const MCP_OAUTH_LEASE_POLL_MAX_MS = 1000;

type SingleFlight<T> = { promise: Promise<T> };

const refreshFlights = new Map<string, SingleFlight<string>>();

const getMcpOAuthRuntimeKey = ({ appId, nodeId }: { appId: string; nodeId: string }) =>
  `${appId}:${nodeId}`;

type OAuthContext = {
  version: Awaited<ReturnType<typeof getMcpToolSetVersionDoc>>;
  node: ReturnType<typeof resolveMcpOAuthNode>;
  oauth: NonNullable<ReturnType<typeof getNodeMcpToolSet>>['oauth'];
};

const readOAuthContext = async ({
  appId,
  nodeId
}: {
  appId: string;
  nodeId: string;
}): Promise<OAuthContext> => {
  const version = await getMcpToolSetVersionDoc(appId);
  const node = resolveMcpOAuthNode(version, nodeId);
  const toolSet = getNodeMcpToolSet(node);
  if (!toolSet) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.nodeNotFound, {
      message: 'MCP toolset config was not found'
    });
  }
  if (toolSet.authMode !== 'oauth') {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.notOAuthMode, {
      message: 'MCP toolset is not in oauth mode'
    });
  }
  return { version, node, oauth: toolSet.oauth };
};

/**
 * headers 模式完全沿用旧逻辑；oauth 模式注入 Bearer，不回退 headerSecret。
 */
export const resolveMcpToolSetHeaders = async ({
  appId,
  nodeId,
  toolSet,
  allowRefresh = true
}: {
  appId: string;
  nodeId: string;
  toolSet?: {
    authMode?: 'headers' | 'oauth';
    headerSecret?: Parameters<typeof getSecretValue>[0]['storeSecret'];
  };
  allowRefresh?: boolean;
}) => {
  if (toolSet?.authMode !== 'oauth') {
    return getSecretValue({ storeSecret: toolSet?.headerSecret });
  }

  const accessToken = await ensureMcpOAuthAccessToken({
    appId,
    nodeId,
    allowRefresh
  });
  return { Authorization: `Bearer ${accessToken}` };
};

const tryAcquireRefreshLease = async ({
  versionId,
  appId,
  nodeId,
  expectedSeq,
  owner,
  now
}: {
  versionId: unknown;
  appId: string;
  nodeId: string;
  expectedSeq: number;
  owner: string;
  now: number;
}) => {
  const result = await MongoAppVersion.updateOne(
    {
      _id: versionId,
      appId,
      nodes: {
        $elemMatch: {
          nodeId,
          'toolConfig.mcpToolSet.authMode': 'oauth',
          $and: [
            seqMatch(expectedSeq),
            {
              $or: [
                { 'toolConfig.mcpToolSet.oauth.refreshLease': null },
                { 'toolConfig.mcpToolSet.oauth.refreshLease.expiresAt': { $lte: now } }
              ]
            }
          ]
        }
      }
    },
    {
      $set: {
        'nodes.$[n].toolConfig.mcpToolSet.oauth.refreshLease': {
          owner,
          expiresAt: now + MCP_OAUTH_REFRESH_LEASE_MS
        }
      }
    },
    { arrayFilters: [{ 'n.nodeId': nodeId }], strict: false }
  );
  return result.matchedCount === 1;
};

const releaseRefreshLease = async ({
  versionId,
  appId,
  nodeId,
  owner
}: {
  versionId: unknown;
  appId: string;
  nodeId: string;
  owner: string;
}) => {
  try {
    await MongoAppVersion.updateOne(
      {
        _id: versionId,
        appId,
        nodes: {
          $elemMatch: {
            nodeId,
            'toolConfig.mcpToolSet.oauth.refreshLease.owner': owner
          }
        }
      },
      { $set: { 'nodes.$[n].toolConfig.mcpToolSet.oauth.refreshLease': null } },
      { arrayFilters: [{ 'n.nodeId': nodeId }], strict: false }
    );
  } catch {
    // 租约自然过期兜底；释放失败不改变业务结果。
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toRuntimeError = (error: unknown): Error => {
  if (error instanceof McpOAuthApiError) return error;
  return new McpOAuthApiError(McpOAuthErrorCodeEnum.refreshTransient, {
    message: 'Token refresh failed',
    cause: error
  });
};

const persistLastError = async ({
  appId,
  nodeId,
  expectedSeq,
  leaseOwner,
  lastError
}: {
  appId: string;
  nodeId: string;
  expectedSeq: number;
  leaseOwner: string;
  lastError: McpOAuthLastErrorType;
}) => {
  await updateMcpOAuthNodeFields({
    appId,
    nodeId,
    expectedCredentialSeq: expectedSeq,
    leaseOwner,
    set: { lastError }
  });
};

const refreshWithLease = async ({
  appId,
  nodeId,
  context,
  now
}: {
  appId: string;
  nodeId: string;
  context: OAuthContext;
  now: number;
}): Promise<string> => {
  const { version, oauth } = context;
  if (!oauth) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.reauthRequired, {
      message: 'OAuth is not configured'
    });
  }

  const client = oauth.client;
  const server = oauth.server;
  const refreshToken = decryptMcpOAuthRefreshToken(oauth.token);
  if (!client || !server?.tokenEndpoint || !refreshToken) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.reauthRequired, {
      message: 'No refresh token or client configuration'
    });
  }

  const expectedSeq = oauth.credentialSeq ?? 0;
  const owner = randomUUID();
  const acquired = await tryAcquireRefreshLease({
    versionId: version._id,
    appId,
    nodeId,
    expectedSeq,
    owner,
    now
  });

  if (!acquired) {
    // 其它实例正在刷新：按指数退避轮询等待胜出者写回，不重复刷新。
    // 100ms → 200ms → 400ms → 800ms → 1s，11s 预算内最多约 15 次读取。
    const deadline = now + MCP_OAUTH_LEASE_WAIT_MS;
    let pollDelay = MCP_OAUTH_LEASE_POLL_MS;
    while (Date.now() < deadline) {
      await wait(Math.min(pollDelay, Math.max(0, deadline - Date.now())));
      pollDelay = Math.min(pollDelay * 2, MCP_OAUTH_LEASE_POLL_MAX_MS);
      const latest = await readOAuthContext({ appId, nodeId });
      const latestToken = latest.oauth?.token;
      if (
        latestToken &&
        (latest.oauth?.credentialSeq ?? 0) > expectedSeq &&
        isMcpOAuthAccessTokenUsable(latestToken)
      ) {
        const access = decryptMcpOAuthAccessToken(latestToken);
        if (access) return access;
      }
    }
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.refreshTransient, {
      message: 'Timed out waiting for a concurrent token refresh'
    });
  }

  try {
    const clientSecret = client.clientSecret ? decryptSecretValue(client.clientSecret) : undefined;
    const nextToken = await refreshMcpOAuthAccessToken({
      tokenEndpoint: server.tokenEndpoint,
      clientId: client.clientId,
      clientSecret: typeof clientSecret === 'string' ? clientSecret : undefined,
      authMethod: client.tokenEndpointAuthMethod,
      refreshToken,
      resource: oauth.resource ?? undefined,
      previousToken: oauth.token
    });

    const written = await updateMcpOAuthNodeFields({
      appId,
      nodeId,
      expectedCredentialSeq: expectedSeq,
      leaseOwner: owner,
      set: { token: nextToken, lastError: null, authorizedAt: now },
      incrementSeq: true
    });

    if (written.matched) {
      const access = decryptMcpOAuthAccessToken(nextToken);
      if (!access) {
        throw new McpOAuthApiError(McpOAuthErrorCodeEnum.refreshTransient, {
          message: 'Refreshed token is empty'
        });
      }
      return access;
    }

    // CAS 失败：使用胜出者的 token；不得覆盖。
    const latest = await readOAuthContext({ appId, nodeId });
    if ((latest.oauth?.credentialSeq ?? 0) > expectedSeq) {
      const access = decryptMcpOAuthAccessToken(latest.oauth?.token);
      if (access) return access;
    }
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.conflict, {
      message: 'Credential sequence changed while refreshing'
    });
  } catch (error) {
    const apiError = toRuntimeError(error);
    const code = apiError instanceof McpOAuthApiError ? apiError.oauthCode : undefined;

    if (
      code === McpOAuthErrorCodeEnum.reauthRequired ||
      code === McpOAuthErrorCodeEnum.clientRejected
    ) {
      await updateMcpOAuthNodeFields({
        appId,
        nodeId,
        expectedCredentialSeq: expectedSeq,
        leaseOwner: owner,
        unset: ['token', 'lastError'],
        incrementSeq: true
      }).catch(() => undefined);
    } else if (apiError instanceof McpOAuthApiError) {
      await persistLastError({
        appId,
        nodeId,
        expectedSeq,
        leaseOwner: owner,
        lastError: {
          code: apiError.oauthCode,
          at: now,
          retryable: apiError.retryable,
          ...(apiError.retryAfterMs ? { retryAfterMs: apiError.retryAfterMs } : {})
        }
      }).catch(() => undefined);
    }

    throw apiError;
  } finally {
    await releaseRefreshLease({ versionId: version._id, appId, nodeId, owner });
  }
};

const withRefreshSingleFlight = (key: string, task: () => Promise<string>): Promise<string> => {
  const existing = refreshFlights.get(key);
  if (existing) return existing.promise;

  const flight: SingleFlight<string> = { promise: task() };
  refreshFlights.set(key, flight);
  const cleanup = () => {
    if (refreshFlights.get(key) === flight) refreshFlights.delete(key);
  };
  flight.promise.then(cleanup, cleanup);
  return flight.promise;
};

/**
 * 获取可用 access token；过期前 30s 主动刷新。
 * `forceRefresh` 用于运行期 401：忽略余量强制刷新一次。
 */
export const ensureMcpOAuthAccessToken = async ({
  appId,
  nodeId,
  forceRefresh = false,
  allowRefresh = true,
  now = Date.now()
}: {
  appId: string;
  nodeId: string;
  forceRefresh?: boolean;
  allowRefresh?: boolean;
  now?: number;
}): Promise<string> => {
  const key = `${getMcpOAuthRuntimeKey({ appId, nodeId })}:${forceRefresh ? 'force' : 'lazy'}`;

  return withRefreshSingleFlight(key, async () => {
    const context = await readOAuthContext({ appId, nodeId });
    const token = context.oauth?.token;

    if (!forceRefresh && isMcpOAuthAccessTokenUsable(token, { now })) {
      const access = decryptMcpOAuthAccessToken(token);
      if (access) return access;
    }

    if (!allowRefresh) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.reauthRequired, {
        message: 'OAuth token is not usable and refresh is disabled'
      });
    }

    return refreshWithLease({ appId, nodeId, context, now });
  });
};

/**
 * 只有 transport 层的 401 才触发强制刷新/重授权。
 *
 * 工具级错误即使带 `{ status: 401 }` 也仍是业务错误：与 `mcp.ts` 的
 * `toMcpAuthRequiredError` / `normalizeMcpClientError` 共用同一判定，避免把一次
 * 工具失败放大成一次无谓的 token 刷新并最终误报 `reauthRequired`。
 */
export const isMcpOAuthUnauthorizedError = (error: unknown) =>
  getMcpTransportHttpStatus(error) === 401;

export const isMcpOAuthInsufficientScopeError = (error: unknown) => {
  if (getMcpTransportHttpStatus(error) !== 403) return false;
  // 优先读取 RFC 6750 挑战；无 header 时兼容错误文案。
  if (getMcpOAuthChallenge(error)?.error === 'insufficient_scope') return true;
  return `${error instanceof Error ? error.message : error}`
    .toLowerCase()
    .includes('insufficient_scope');
};

/**
 * 运行期 401：强制刷新并重试一次；403 + insufficient_scope 直接失败。
 * 只解析一次 headers；刷新后复用同一 Bearer 构造逻辑。
 */
export const withMcpOAuthRetry = async <T>({
  appId,
  nodeId,
  run,
  allowRefresh = true
}: {
  appId: string;
  nodeId: string;
  run: (headers: Record<string, string>) => Promise<T>;
  allowRefresh?: boolean;
}): Promise<T> => {
  const headers = await resolveMcpToolSetHeaders({
    appId,
    nodeId,
    toolSet: { authMode: 'oauth' },
    allowRefresh
  });

  try {
    return await run(headers);
  } catch (error) {
    if (isMcpOAuthInsufficientScopeError(error)) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.insufficientScope, {
        message: 'MCP server requires additional scope',
        cause: error
      });
    }
    if (!isMcpOAuthUnauthorizedError(error)) throw error;
    if (!allowRefresh) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.reauthRequired, {
        message: 'MCP server rejected the access token and refresh is disabled',
        cause: error
      });
    }

    // 401 后仅强制刷新一次；insufficient_scope 在第一次响应即直接返回，不会走到这里。
    const accessToken = await ensureMcpOAuthAccessToken({
      appId,
      nodeId,
      forceRefresh: true
    });
    const retryHeaders = { ...headers, Authorization: `Bearer ${accessToken}` };

    try {
      return await run(retryHeaders);
    } catch (retryError) {
      if (isMcpOAuthInsufficientScopeError(retryError)) {
        throw new McpOAuthApiError(McpOAuthErrorCodeEnum.insufficientScope, {
          message: 'MCP server requires additional scope',
          cause: retryError
        });
      }
      if (isMcpOAuthUnauthorizedError(retryError)) {
        throw new McpOAuthApiError(McpOAuthErrorCodeEnum.reauthRequired, {
          message: 'MCP server rejected the refreshed token',
          cause: retryError
        });
      }
      throw retryError;
    }
  }
};

/**
 * 删除应用前尽力撤销令牌（RFC 7009）。
 * 任何失败都吞掉：撤销不阻塞删除，也不影响本地清理。
 */
export const revokeMcpOAuthForApp = async (appId: string): Promise<void> => {
  try {
    const version = await getMcpToolSetVersionDoc(appId);
    const nodes = getToolSetNodes(version);

    await Promise.all(
      nodes.map(async (node) => {
        try {
          const toolSet = getNodeMcpToolSet(node);
          const oauth = toolSet?.oauth;
          const revocationEndpoint = oauth?.server?.revocationEndpoint;
          const clientId = oauth?.client?.clientId;
          if (toolSet?.authMode !== 'oauth' || !revocationEndpoint || !clientId) return;

          const clientSecret = oauth.client?.clientSecret
            ? decryptSecretValue(oauth.client.clientSecret)
            : undefined;
          const refreshToken = decryptMcpOAuthRefreshToken(oauth.token);
          const accessToken = decryptMcpOAuthAccessToken(oauth.token);
          const token = refreshToken ?? accessToken;
          if (typeof token !== 'string' || !token) return;

          await revokeMcpOAuthToken({
            revocationEndpoint,
            clientId,
            clientSecret: typeof clientSecret === 'string' ? clientSecret : undefined,
            authMethod: oauth.client?.tokenEndpointAuthMethod ?? 'none',
            token,
            tokenTypeHint: refreshToken ? 'refresh_token' : 'access_token'
          });
        } catch {
          // best-effort：单个节点失败不影响其他节点或删除流程。
        }
      })
    );
  } catch {
    // 版本/应用不存在或读取失败：删除流程继续。
  }
};
