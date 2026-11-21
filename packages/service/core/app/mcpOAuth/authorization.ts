import type {
  McpOAuthClientMode,
  McpOAuthClientSource
} from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import type { McpOAuthManualClientType } from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import {
  assertMcpOAuthNodeReady,
  getMcpToolSetVersionDoc,
  resolveMcpOAuthNode,
  updateMcpOAuthNodeFields
} from './credential';
import { discoverMcpOAuth } from './discovery';
import { McpOAuthApiError } from './errors';
import {
  assertMcpOAuthPkceSupported,
  buildMcpOAuthAuthorizationUrl,
  createMcpOAuthPkce,
  isMcpOAuthCimdAvailable,
  normalizeMcpOAuthRequestedScope,
  selectMcpOAuthClient
} from './registration';
import {
  buildMcpOAuthState,
  createMcpOAuthNonce,
  expirePendingMcpOAuthStates,
  findPendingCimdAttempt,
  markMcpOAuthStateDowngraded,
  sha256Hex,
  writeMcpOAuthState
} from './state';
import {
  getMcpOAuthCimdClientId,
  getMcpOAuthRedirectUri,
  getMcpOAuthRouteConfig
} from './apiSupport';

/**
 * start 的完整服务端流程（v2.4 §4.4 + 决策 D8）。
 *
 * `oauth/start` 与「callback 捕获到可降级错误后自动再 start」共用本函数：
 * 发现 → 选择 client（可选强制 DCR）→ 写回节点 → 写一次性台账 → 返回授权 URL。
 *
 * 自动降级触发条件（只在 `clientMode=auto` 生效）：
 * - 台账里存在「未消费、未降级过」且 `clientSource=cimd` 的上一次尝试；
 * - 或节点上已有粘性标记 `oauth.autoDcrFallback=true`（同一条授权链持续 DCR）。
 *
 * 降级只发生一次：触发后在该台账写 `downgradedAt`，并在节点写粘性标记；
 * 成功授权（token 落库）或 client/reset 时由调用方清除粘性标记。
 */

export type McpOAuthAuthorizationStartResult = {
  appId: string;
  nodeId: string;
  teamId: string;
  tmbId: string;
  authorizationUrl: string;
  clientMode: McpOAuthClientMode;
  clientSource: McpOAuthClientSource;
  issuer: string;
  resource: string;
  scope?: string;
  expiresAt: number;
  /** 供调用方设置绑定 Cookie；state 原文只在这里短暂持有，不得写日志。 */
  state: string;
  bindCookieValue: string;
  /** 本次是否为自动降级到 DCR。 */
  downgraded: boolean;
};

export const startMcpOAuthAuthorization = async ({
  appId,
  teamId,
  tmbId,
  nodeId,
  clientMode,
  requestedScope,
  manualClient,
  forceDcr = false,
  now = Date.now()
}: {
  appId: string;
  teamId: string;
  tmbId: string;
  nodeId?: string;
  clientMode: McpOAuthClientMode;
  requestedScope?: string;
  manualClient?: McpOAuthManualClientType;
  /** callback 分支捕获到可降级错误时传 true；manual 模式仍然不降级。 */
  forceDcr?: boolean;
  now?: number;
}): Promise<McpOAuthAuthorizationStartResult> => {
  const config = getMcpOAuthRouteConfig();
  const version = await getMcpToolSetVersionDoc(appId);
  const node = resolveMcpOAuthNode(version, nodeId);
  const toolSet = assertMcpOAuthNodeReady(node);
  const oauth = toolSet.oauth;
  const expectedSeq = oauth?.credentialSeq ?? 0;
  const effectiveNodeId = node.nodeId;

  const discovery = await discoverMcpOAuth({
    mcpUrl: toolSet.url!,
    previousIssuer: oauth?.issuer ?? undefined,
    allowInsecureHttp: config.allowInsecureHttp
  });
  assertMcpOAuthPkceSupported(discovery.server);

  const scope = normalizeMcpOAuthRequestedScope(requestedScope ?? oauth?.scope ?? undefined);
  const redirectUri = getMcpOAuthRedirectUri();
  const cimdClientId = getMcpOAuthCimdClientId();
  const cimdAvailable = await isMcpOAuthCimdAvailable({
    server: discovery.server,
    feDomain: config.feDomain
  });

  // 只有 auto 允许自动降级；manual 永远按用户配置执行。
  let forceDcrSelection = clientMode === 'auto' && forceDcr;
  let downgradeTriggerId: string | undefined;

  if (clientMode === 'auto' && !forceDcrSelection) {
    if (oauth?.autoDcrFallback === true) {
      // 同一条授权链此前已降级：保持 DCR，避免再次尝试已知失败的 CIMD。
      forceDcrSelection = true;
    } else {
      const pendingCimd = await findPendingCimdAttempt({
        appId,
        nodeId: effectiveNodeId,
        tmbId
      });
      if (pendingCimd) {
        forceDcrSelection = true;
        downgradeTriggerId = pendingCimd._id;
      }
    }
  }

  const selection = await selectMcpOAuthClient({
    server: discovery.server,
    clientMode,
    redirectUri,
    cimdClientId,
    cimdAvailable,
    savedClient: oauth?.client ?? undefined,
    savedClientSource: oauth?.clientSource ?? undefined,
    manualClient,
    forceDcr: forceDcrSelection,
    now
  });

  const downgraded = clientMode === 'auto' && forceDcrSelection && selection.source === 'dcr';

  const written = await updateMcpOAuthNodeFields({
    appId,
    nodeId: effectiveNodeId,
    expectedCredentialSeq: expectedSeq,
    set: {
      client: selection.client,
      clientMode,
      clientSource: selection.source,
      issuer: discovery.issuer,
      resource: discovery.resource,
      scope,
      server: discovery.server,
      ...(downgraded ? { autoDcrFallback: true } : {})
    }
  });

  if (!written.matched) {
    const latestVersion = await getMcpToolSetVersionDoc(appId);
    const latestNode = resolveMcpOAuthNode(latestVersion, effectiveNodeId);
    const latestToolSet = assertMcpOAuthNodeReady(latestNode);
    const latestOAuth = latestToolSet.oauth;
    if (
      latestOAuth?.client?.clientId !== selection.client.clientId ||
      latestOAuth?.issuer !== discovery.issuer ||
      latestOAuth?.resource !== discovery.resource
    ) {
      throw new McpOAuthApiError(McpOAuthErrorCodeEnum.conflict, {
        message: 'OAuth credential changed while starting authorization'
      });
    }
  }

  // 必须在 expirePendingMcpOAuthStates 之前标记，否则该台账会被当成已消费。
  if (downgradeTriggerId) {
    await markMcpOAuthStateDowngraded({ stateHash: downgradeTriggerId, now });
  }

  const pkce = createMcpOAuthPkce();
  const built = buildMcpOAuthState({
    appId,
    nodeId: effectiveNodeId,
    teamId,
    tmbId,
    redirectUri,
    codeVerifier: pkce.codeVerifier,
    issuer: discovery.issuer,
    resource: discovery.resource,
    scope,
    clientIdHash: sha256Hex(selection.client.clientId),
    now
  });

  const bindCookieValue = createMcpOAuthNonce();
  await expirePendingMcpOAuthStates({ appId, nodeId: effectiveNodeId, tmbId, now });
  await writeMcpOAuthState({
    payload: built.payload,
    bindCookieHash: sha256Hex(bindCookieValue),
    clientSource: selection.source,
    now
  });

  return {
    appId,
    nodeId: effectiveNodeId,
    teamId,
    tmbId,
    authorizationUrl: buildMcpOAuthAuthorizationUrl({
      authorizationEndpoint: discovery.server.authorizationEndpoint,
      clientId: selection.client.clientId,
      redirectUri,
      scope,
      state: built.state,
      codeChallenge: pkce.codeChallenge,
      resource: discovery.resource
    }),
    clientMode,
    clientSource: selection.source,
    issuer: discovery.issuer,
    resource: discovery.resource,
    ...(scope !== undefined ? { scope } : {}),
    expiresAt: built.expiresAt,
    state: built.state,
    bindCookieValue,
    downgraded
  };
};
