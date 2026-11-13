import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import type { McpOAuthStatusResponseType } from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import {
  McpOAuthErrorCodeEnum,
  McpOAuthStatusEnum,
  type McpOAuthAuthMode,
  type McpOAuthClientMode
} from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import type {
  McpOAuthClientType,
  McpOAuthServerMetadataType,
  McpToolSetOAuthConfigType
} from '@fastgpt/global/core/app/tool/mcpTool/oauthConfig';
import { McpOAuthApiError } from './errors';
import { MCP_OAUTH_REFRESH_MARGIN_MS } from './token';
import { MongoApp } from '../schema';
import { MongoAppVersion } from '../version/schema';
import { MCP_OAUTH_NODE_MAX_BYTES } from './schema';
import type { ClientSession } from 'mongoose';

/**
 * 目标版本文档与 OAuth 字段写（v2.4 §7）。
 *
 * 唯一写入口：单条 `updateOne` + `$elemMatch`/arrayFilters + `$inc nodesRevision`。
 * 永不写整个 `nodes`，永不重建版本。
 */

export const seqMatch = (seq: number) =>
  seq === 0
    ? {
        $or: [
          { 'toolConfig.mcpToolSet.oauth.credentialSeq': 0 },
          { 'toolConfig.mcpToolSet.oauth.credentialSeq': { $exists: false } }
        ]
      }
    : { 'toolConfig.mcpToolSet.oauth.credentialSeq': seq };

/** 发布版本解析：`publishedVersionId` 优先，否则最新 `isPublish`（与设计 §7.1 完全一致）。 */
export const getMcpToolSetVersionDoc = async (
  appId: string,
  session?: ClientSession
): Promise<AppVersionSchemaType> => {
  const app = await MongoApp.findById(appId, 'type publishedVersionId')
    .session(session ?? null)
    .lean();
  if (!app) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.appMissing, {
      message: 'App was not found'
    });
  }
  if (app.type !== AppTypeEnum.mcpToolSet) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.notToolset, {
      message: 'App is not an MCP toolset'
    });
  }

  if (app.publishedVersionId) {
    const version = await MongoAppVersion.findOne({
      _id: app.publishedVersionId,
      appId
    })
      .session(session ?? null)
      .lean();
    if (version) return version as AppVersionSchemaType;
  }

  const fallback = await MongoAppVersion.findOne({ appId, isPublish: true })
    .sort({ time: -1, _id: -1 })
    .session(session ?? null)
    .lean();
  if (!fallback) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.appMissing, {
      message: 'Published app version was not found'
    });
  }
  return fallback as AppVersionSchemaType;
};

type ToolSetNodeType = {
  nodeId: string;
  flowNodeType?: string;
  toolConfig?: {
    mcpToolSet?: {
      url?: string;
      authMode?: McpOAuthAuthMode;
      oauth?: McpToolSetOAuthConfigType;
      [key: string]: unknown;
    };
  };
  [key: string]: unknown;
};

export const getToolSetNodes = (version: Pick<AppVersionSchemaType, 'nodes'>): ToolSetNodeType[] =>
  ((version.nodes ?? []) as unknown as ToolSetNodeType[]).filter(
    (node) => node?.flowNodeType === FlowNodeTypeEnum.toolSet
  );

/** 唯一 toolSet 节点；0 个 → node_not_found；≥2 个 → node_ambiguous。 */
export const resolveMcpOAuthNode = (
  version: Pick<AppVersionSchemaType, 'nodes'>,
  nodeId?: string
): ToolSetNodeType => {
  const nodes = getToolSetNodes(version);

  if (nodeId) {
    const node = nodes.find((item) => item.nodeId === nodeId);
    if (!node) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.nodeNotFound, {
        message: 'OAuth toolset node was not found'
      });
    }
    return node;
  }

  if (nodes.length === 0) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.nodeNotFound, {
      message: 'OAuth toolset node was not found'
    });
  }
  if (nodes.length > 1) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.nodeAmbiguous, {
      message: 'Multiple toolset nodes exist; nodeId is required'
    });
  }
  return nodes[0];
};

export const getNodeMcpToolSet = (node: ToolSetNodeType) => node?.toolConfig?.mcpToolSet;

/** start 前置校验：oauth 模式、URL 存在、节点 OAuth 配置 ≤16KB。 */
export const assertMcpOAuthNodeReady = (node: ToolSetNodeType) => {
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
  if (!toolSet.url) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.urlMismatch, {
      message: 'MCP toolset URL is missing'
    });
  }

  const oauthBytes = Buffer.byteLength(JSON.stringify(toolSet.oauth ?? {}), 'utf8');
  if (oauthBytes > MCP_OAUTH_NODE_MAX_BYTES) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.nodeTooLarge, {
      message: 'OAuth config exceeds 16KB'
    });
  }

  return toolSet;
};

/**
 * 唯一 OAuth 字段写入口。
 *
 * `set`/`unset` 的键是 `oauth` 下的相对路径；`nodesRevision` 已在版本 schema
 * 声明，因此写入保持 strict 校验。
 */
export const updateMcpOAuthNodeFields = async ({
  appId,
  nodeId,
  expectedCredentialSeq,
  set,
  unset,
  incrementSeq = false,
  leaseOwner
}: {
  appId: string;
  nodeId: string;
  expectedCredentialSeq: number;
  set?: Record<string, unknown>;
  unset?: string[];
  incrementSeq?: boolean;
  leaseOwner?: string;
}): Promise<{ matched: boolean }> => {
  const version = await getMcpToolSetVersionDoc(appId);

  const filter = {
    _id: version._id,
    appId,
    nodes: {
      $elemMatch: {
        nodeId,
        'toolConfig.mcpToolSet.authMode': 'oauth',
        $and: [
          seqMatch(expectedCredentialSeq),
          ...(leaseOwner ? [{ 'toolConfig.mcpToolSet.oauth.refreshLease.owner': leaseOwner }] : [])
        ]
      }
    }
  };

  const prefix = 'nodes.$[n].toolConfig.mcpToolSet.oauth';
  const $set = Object.fromEntries(
    Object.entries(set ?? {}).map(([key, value]) => [`${prefix}.${key}`, value])
  );
  const $unset = Object.fromEntries((unset ?? []).map((key) => [`${prefix}.${key}`, '']));

  const result = await MongoAppVersion.updateOne(
    filter,
    {
      ...(Object.keys($set).length ? { $set } : {}),
      ...(Object.keys($unset).length ? { $unset } : {}),
      $inc: {
        nodesRevision: 1,
        ...(incrementSeq ? { [`${prefix}.credentialSeq`]: 1 } : {})
      }
    },
    { arrayFilters: [{ 'n.nodeId': nodeId }] }
  );

  return { matched: result.matchedCount === 1 };
};

export type McpOAuthStatusLastError = McpOAuthStatusResponseType['lastError'];

export const deriveMcpOAuthStatus = ({
  authMode,
  toolSet,
  oauth,
  hasPendingState = false,
  now = Date.now()
}: {
  authMode: McpOAuthAuthMode;
  toolSet: { url?: string };
  oauth?: McpToolSetOAuthConfigType;
  hasPendingState?: boolean;
  now?: number;
}): McpOAuthStatusResponseType => {
  const clientMode: McpOAuthClientMode = oauth?.clientMode ?? 'auto';
  const clientSource = oauth?.clientSource ?? null;
  const issuer = oauth?.issuer ?? null;
  const resource = oauth?.resource ?? null;
  const scope = oauth?.token?.scope ?? null;
  const requestedScope = oauth?.scope ?? null;
  const hasAccessToken = !!oauth?.token?.secret?.access_token;
  const hasRefreshToken = !!oauth?.token?.secret?.refresh_token;
  const hasClientSecret = !!oauth?.client?.clientSecret;
  const expiresAt = oauth?.token?.expiresAt ?? null;
  const refreshDueAt =
    oauth?.token && hasRefreshToken && oauth.token.expiresAt > 0
      ? oauth.token.expiresAt - MCP_OAUTH_REFRESH_MARGIN_MS
      : null;

  const lastError: McpOAuthStatusLastError = oauth?.lastError
    ? {
        code: oauth.lastError.code,
        message: oauth.lastError.code,
        retryable: oauth.lastError.retryable,
        at: oauth.lastError.at,
        ...(oauth.lastError.retryable
          ? { nextRetryAt: oauth.lastError.at + (oauth.lastError.retryAfterMs ?? 0) }
          : {})
      }
    : null;

  const base = {
    schemaVersion: 1 as const,
    authMode,
    clientMode,
    clientSource,
    issuer,
    resource,
    scope,
    requestedScope,
    authorized: false,
    hasAccessToken,
    hasRefreshToken,
    hasClientSecret,
    expiresAt,
    refreshDueAt,
    authorizedAt: oauth?.authorizedAt ?? null,
    authorizedBy: oauth?.authorizedBy ?? null,
    lastError,
    canStart: false,
    canDisconnect: false,
    canResetClient: false,
    updatedAt: now
  };

  if (authMode === 'headers') {
    return {
      ...base,
      state: McpOAuthStatusEnum.headers,
      canStart: false,
      canDisconnect: false,
      canResetClient: false
    };
  }

  const canStart = !!toolSet.url;
  const canDisconnect = hasAccessToken;
  const canResetClient = !!oauth?.client || !!oauth?.token;
  const withActions = { ...base, canStart, canDisconnect, canResetClient };

  if (!oauth || oauth.schemaVersion !== 1) {
    return { ...withActions, state: McpOAuthStatusEnum.configError };
  }

  // 缺少发现结果且 URL 缺失 → 无法开始，属于配置错误（§8.2）。
  if (!toolSet.url && (!oauth.issuer || !oauth.server)) {
    return { ...withActions, state: McpOAuthStatusEnum.configError };
  }

  if (hasPendingState) {
    return { ...withActions, state: McpOAuthStatusEnum.pendingAuthorization };
  }

  if (oauth.refreshLease && oauth.refreshLease.expiresAt > now) {
    return { ...withActions, state: McpOAuthStatusEnum.refreshing };
  }

  // client / 非可重试错误的优先级高于 token 可用性：否则 client_missing 永远不会出现，
  // 且持久化的鉴权失败会被一个刚好仍可用的旧 token 掩盖。
  if (toolSet.url && !oauth.client) {
    return { ...withActions, state: McpOAuthStatusEnum.clientMissing };
  }

  if (lastError && !lastError.retryable) {
    return { ...withActions, state: McpOAuthStatusEnum.reauthRequired };
  }

  if (hasAccessToken) {
    const usable =
      expiresAt === 0 || (expiresAt !== null && expiresAt - now > MCP_OAUTH_REFRESH_MARGIN_MS);
    if (usable) {
      return {
        ...withActions,
        state: McpOAuthStatusEnum.authorized,
        authorized: true,
        canDisconnect: true
      };
    }
  }

  if (
    hasAccessToken &&
    hasRefreshToken &&
    expiresAt !== null &&
    expiresAt - now <= MCP_OAUTH_REFRESH_MARGIN_MS
  ) {
    return { ...withActions, state: McpOAuthStatusEnum.refreshDue, authorized: true };
  }

  if (
    !hasAccessToken ||
    (expiresAt !== null && expiresAt - now <= MCP_OAUTH_REFRESH_MARGIN_MS && !hasRefreshToken)
  ) {
    return { ...withActions, state: McpOAuthStatusEnum.reauthRequired };
  }

  return { ...withActions, state: McpOAuthStatusEnum.reauthRequired };
};

export const getMcpOAuthStatus = async ({
  appId,
  nodeId,
  hasPendingState = false,
  now = Date.now()
}: {
  appId: string;
  nodeId?: string;
  hasPendingState?: boolean;
  now?: number;
}) => {
  const version = await getMcpToolSetVersionDoc(appId);
  const node = resolveMcpOAuthNode(version, nodeId);
  const toolSet = getNodeMcpToolSet(node);
  if (!toolSet) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.nodeNotFound, {
      message: 'MCP toolset config was not found'
    });
  }
  const authMode: McpOAuthAuthMode = toolSet.authMode ?? 'headers';
  const status = deriveMcpOAuthStatus({
    authMode,
    toolSet,
    oauth: toolSet.oauth,
    hasPendingState,
    now
  });
  return { version, node, toolSet, status };
};

/**
 * 用户保存时的 OAuth 合并（v2.4 §7.3）。纯函数，便于 I4 的 update 复用。
 */
export const mergeMcpOAuthFromPublished = ({
  existingOAuth,
  previousAuthMode,
  nextAuthMode,
  urlChanged,
  nextClientMode,
  nextScope,
  nextIssuer
}: {
  existingOAuth?: McpToolSetOAuthConfigType;
  previousAuthMode: McpOAuthAuthMode;
  nextAuthMode?: McpOAuthAuthMode;
  urlChanged: boolean;
  nextClientMode?: McpOAuthClientMode;
  nextScope?: string;
  /** URL 变更后重新发现到的 issuer；与旧值不同则丢弃 client（§7.3）。 */
  nextIssuer?: string;
}): { oauth?: McpToolSetOAuthConfigType; credentialSeqDelta: number } => {
  // 未显式传 authMode 表示沿用当前模式，不能因此跳过 URL 变更清理。
  const effectiveNextAuthMode = nextAuthMode ?? previousAuthMode;

  if (effectiveNextAuthMode === previousAuthMode) {
    if (!existingOAuth) return { credentialSeqDelta: 0 };

    if (effectiveNextAuthMode === 'oauth' && urlChanged) {
      const {
        token,
        server,
        refreshLease,
        revokeLease,
        lastError,
        client,
        clientSource,
        issuer: previousIssuer,
        resource,
        ...rest
      } = existingOAuth;
      // 只有“旧 issuer 已知且与新 issuer 相同”才能证明原 client 仍属于同一 AS。
      // URL 变更且未重新发现 issuer 时无法证明，必须清 client 且不写回旧 issuer；
      // 旧 issuer 未知、新 issuer 已知时同样无法证明，按最保守策略丢弃 client。
      const keepClient =
        !!client &&
        nextIssuer !== undefined &&
        previousIssuer !== undefined &&
        nextIssuer === previousIssuer;
      // client 被丢弃时 clientSource 必须同步清空，避免持久化出“来源已声明但无 client”
      // 的不一致记录（status 投影与 selectMcpOAuthClient 都会据此误判）。
      // 历史数据里的 null 同样视为“未确定”：写回时省略该键，绝不落 null。
      const nextClientSource = keepClient && clientSource ? clientSource : undefined;
      return {
        oauth: {
          ...(rest as McpToolSetOAuthConfigType),
          ...(nextIssuer !== undefined ? { issuer: nextIssuer } : {}),
          ...(keepClient ? { client } : {}),
          ...(nextClientSource !== undefined ? { clientSource: nextClientSource } : {}),
          ...(nextClientMode ? { clientMode: nextClientMode } : {}),
          ...(nextScope !== undefined ? { scope: nextScope } : {})
        },
        credentialSeqDelta: 1
      };
    }

    // 未变更认证模式：原样保留 OAuth 配置。历史记录可能含 `clientSource: null`，
    // 读侧已容忍；写回时剔除该键，避免把 null 继续持久化。
    const { clientSource: existingClientSource, ...existingRest } = existingOAuth;
    return {
      oauth: {
        ...existingRest,
        ...(existingClientSource ? { clientSource: existingClientSource } : {}),
        ...(nextClientMode ? { clientMode: nextClientMode } : {}),
        ...(nextScope !== undefined ? { scope: nextScope } : {})
      },
      credentialSeqDelta: 0
    };
  }

  if (effectiveNextAuthMode === 'oauth') {
    // 与 previousAuthMode 不同且 next 为 oauth 时，previous 只能是 headers（上面已处理）。
    return {
      oauth: {
        schemaVersion: 1,
        clientMode: nextClientMode ?? 'auto',
        ...(nextScope !== undefined ? { scope: nextScope } : {}),
        credentialSeq: existingOAuth?.credentialSeq ?? 0
      },
      credentialSeqDelta: 0
    };
  }

  // 切到 headers：清 token / secret / 租约 / lastError，保留 clientId 与发现结果。
  const {
    token,
    refreshLease,
    revokeLease,
    lastError,
    client,
    clientSource: previousClientSource,
    ...rest
  } = existingOAuth ?? {};
  return {
    oauth: {
      ...(rest as McpToolSetOAuthConfigType),
      ...(previousClientSource ? { clientSource: previousClientSource } : {}),
      ...(client
        ? {
            client: {
              clientId: client.clientId,
              tokenEndpointAuthMethod: client.tokenEndpointAuthMethod
            }
          }
        : {}),
      clientMode: nextClientMode ?? existingOAuth?.clientMode ?? 'auto'
    },
    credentialSeqDelta: 1
  };
};

export type { McpOAuthClientType, McpOAuthServerMetadataType };
