import type { ApiRequestProps, NextApiResponse } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  McpOAuthStartBodySchema,
  McpOAuthStartResponseSchema,
  type McpOAuthStartBodyType
} from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import {
  McpOAuthApiError,
  McpOAuthErrorCodeEnum,
  assertMcpOAuthEnabled,
  assertMcpOAuthPkceSupported,
  assertMcpOAuthRateLimit,
  buildMcpOAuthAuthorizationUrl,
  buildMcpOAuthState,
  createMcpOAuthApiHandler,
  createMcpOAuthPkce,
  createMcpOAuthNonce,
  discoverMcpOAuth,
  expirePendingMcpOAuthStates,
  getMcpOAuthCimdClientId,
  getMcpOAuthRedirectUri,
  getMcpOAuthRouteConfig,
  getMcpToolSetVersionDoc,
  isMcpOAuthCimdAvailable,
  normalizeMcpOAuthRequestedScope,
  resolveMcpOAuthNode,
  assertMcpOAuthNodeReady,
  selectMcpOAuthClient,
  sendMcpOAuthJson,
  serializeMcpOAuthBindCookie,
  sha256Hex,
  updateMcpOAuthNodeFields,
  writeMcpOAuthState
} from '@fastgpt/service/core/app/mcpOAuth';

/**
 * POST /api/core/app/mcpTools/oauth/start（v2.4 §4.4）。
 *
 * 先完成发现、client 选择与写回，再写一次性台账，最后返回授权 URL。
 * 台账写失败不返回 URL。
 */

async function handler(req: ApiRequestProps<McpOAuthStartBodyType>, res: NextApiResponse) {
  assertMcpOAuthEnabled();
  const config = getMcpOAuthRouteConfig();
  const {
    body: { appId: requestedAppId, nodeId, clientMode, scope: requestedScope, manualClient }
  } = parseApiInput({ req, bodySchema: McpOAuthStartBodySchema });

  const { app, tmbId } = await authApp({
    req,
    authToken: true,
    appId: requestedAppId,
    per: ManagePermissionVal
  });
  if (app.type !== AppTypeEnum.mcpToolSet) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.notToolset, {
      message: 'App is not an MCP toolset'
    });
  }

  const appId = String(app._id);
  const teamId = String(app.teamId);

  await assertMcpOAuthRateLimit('start-app', { appId });
  await assertMcpOAuthRateLimit('start-user', { tmbId });

  const version = await getMcpToolSetVersionDoc(appId);
  const node = resolveMcpOAuthNode(version, nodeId);
  const toolSet = assertMcpOAuthNodeReady(node);
  const oauth = toolSet.oauth;
  const expectedSeq = oauth?.credentialSeq ?? 0;

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

  const selection = await selectMcpOAuthClient({
    server: discovery.server,
    clientMode,
    redirectUri,
    cimdClientId,
    cimdAvailable,
    savedClient: oauth?.client ?? undefined,
    savedClientSource: oauth?.clientSource ?? undefined,
    manualClient
  });

  const written = await updateMcpOAuthNodeFields({
    appId,
    nodeId: node.nodeId,
    expectedCredentialSeq: expectedSeq,
    set: {
      client: selection.client,
      clientMode,
      clientSource: selection.source,
      issuer: discovery.issuer,
      resource: discovery.resource,
      scope,
      server: discovery.server
    }
  });

  if (!written.matched) {
    const latestVersion = await getMcpToolSetVersionDoc(appId);
    const latestNode = resolveMcpOAuthNode(latestVersion, node.nodeId);
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

  const pkce = createMcpOAuthPkce();
  const built = buildMcpOAuthState({
    appId,
    nodeId: node.nodeId,
    teamId,
    tmbId,
    redirectUri,
    codeVerifier: pkce.codeVerifier,
    issuer: discovery.issuer,
    resource: discovery.resource,
    scope,
    clientIdHash: sha256Hex(selection.client.clientId)
  });

  const bindCookieValue = createMcpOAuthNonce();
  await expirePendingMcpOAuthStates({ appId, nodeId: node.nodeId, tmbId });
  await writeMcpOAuthState({
    payload: built.payload,
    bindCookieHash: sha256Hex(bindCookieValue)
  });

  res.setHeader(
    'Set-Cookie',
    serializeMcpOAuthBindCookie({
      appId,
      value: bindCookieValue,
      feDomain: config.feDomain
    })
  );

  return sendMcpOAuthJson({
    res: res as never,
    status: 200,
    body: McpOAuthStartResponseSchema.parse({
      schemaVersion: 1,
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
      ...(scope !== undefined ? { requestedScope: scope } : {}),
      expiresAt: built.expiresAt
    })
  });
}

export default NextAPI(createMcpOAuthApiHandler(handler));
