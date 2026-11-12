import type { ApiRequestProps, NextApiResponse } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { decryptSecretValue } from '@fastgpt/service/common/secret/utils';
import {
  McpOAuthDisconnectBodySchema,
  McpOAuthDisconnectResponseSchema,
  type McpOAuthDisconnectBodyType
} from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import {
  McpOAuthApiError,
  McpOAuthErrorCodeEnum,
  assertMcpOAuthEnabled,
  assertMcpOAuthRateLimit,
  clearCachedMcpOAuthClient,
  createMcpOAuthApiHandler,
  decryptMcpOAuthAccessToken,
  decryptMcpOAuthRefreshToken,
  getMcpToolSetVersionDoc,
  getNodeMcpToolSet,
  resolveMcpOAuthNode,
  revokeMcpOAuthToken,
  sendMcpOAuthJson,
  updateMcpOAuthNodeFields
} from '@fastgpt/service/core/app/mcpOAuth';

/**
 * POST /api/core/app/mcpTools/oauth/disconnect（v2.4 §8.4）。
 *
 * 幂等：无 token 直接成功且不递增 seq；有 token 先清本地（seq+1），
 * 再尽力远程撤销。
 */
async function handler(req: ApiRequestProps<McpOAuthDisconnectBodyType>, res: NextApiResponse) {
  assertMcpOAuthEnabled();
  const {
    body: { appId: requestedAppId, nodeId }
  } = parseApiInput({ req, bodySchema: McpOAuthDisconnectBodySchema });

  const { app } = await authApp({
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
  await assertMcpOAuthRateLimit('disconnect-app', { appId });

  const version = await getMcpToolSetVersionDoc(appId);
  const node = resolveMcpOAuthNode(version, nodeId);
  const toolSet = getNodeMcpToolSet(node);
  if (toolSet?.authMode !== 'oauth') {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.notOAuthMode, {
      message: 'MCP toolset is not in oauth mode'
    });
  }

  const oauth = toolSet.oauth;
  const token = oauth?.token;
  clearCachedMcpOAuthClient({ appId, nodeId: node.nodeId });

  if (!token) {
    return sendMcpOAuthJson({
      res: res as never,
      status: 200,
      body: McpOAuthDisconnectResponseSchema.parse({
        schemaVersion: 1,
        disconnected: true,
        revoked: false,
        revokeError: null
      })
    });
  }

  const expectedSeq = oauth?.credentialSeq ?? 0;
  const written = await updateMcpOAuthNodeFields({
    appId,
    nodeId: node.nodeId,
    expectedCredentialSeq: expectedSeq,
    unset: ['token', 'lastError', 'refreshLease', 'revokeLease'],
    incrementSeq: true
  });

  if (!written.matched) {
    const latestVersion = await getMcpToolSetVersionDoc(appId);
    const latestNode = resolveMcpOAuthNode(latestVersion, node.nodeId);
    const latestOAuth = getNodeMcpToolSet(latestNode)?.oauth;
    if (!latestOAuth?.token) {
      return sendMcpOAuthJson({
        res: res as never,
        status: 200,
        body: McpOAuthDisconnectResponseSchema.parse({
          schemaVersion: 1,
          disconnected: true,
          revoked: false,
          revokeError: null
        })
      });
    }
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.conflict, {
      message: 'OAuth credential changed while disconnecting'
    });
  }

  const accessToken = decryptMcpOAuthAccessToken(token);
  const refreshToken = decryptMcpOAuthRefreshToken(token);
  const client = oauth?.client;
  const revocationEndpoint = oauth?.server?.revocationEndpoint;

  let revoked = false;
  let revokeError: string | null = null;

  if (revocationEndpoint && client) {
    const clientSecret = client.clientSecret
      ? decryptSecretValue(client.clientSecret)
      : undefined;
    if (accessToken) {
      revoked =
        (await revokeMcpOAuthToken({
          revocationEndpoint,
          clientId: client.clientId,
          clientSecret: typeof clientSecret === 'string' ? clientSecret : undefined,
          authMethod: client.tokenEndpointAuthMethod,
          token: accessToken,
          tokenTypeHint: 'access_token'
        })) || revoked;
    }
    if (refreshToken) {
      revoked =
        (await revokeMcpOAuthToken({
          revocationEndpoint,
          clientId: client.clientId,
          clientSecret: typeof clientSecret === 'string' ? clientSecret : undefined,
          authMethod: client.tokenEndpointAuthMethod,
          token: refreshToken,
          tokenTypeHint: 'refresh_token'
        })) || revoked;
    }
    if (!revoked) revokeError = 'token_revoke_failed';
  }

  return sendMcpOAuthJson({
    res: res as never,
    status: 200,
    body: McpOAuthDisconnectResponseSchema.parse({
      schemaVersion: 1,
      disconnected: true,
      revoked,
      revokeError
    })
  });
}

export default NextAPI(createMcpOAuthApiHandler(handler));
