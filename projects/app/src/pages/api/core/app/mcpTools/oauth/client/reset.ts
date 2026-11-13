import type { ApiRequestProps, NextApiResponse } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { decryptSecretValue } from '@fastgpt/service/common/secret/utils';
import {
  McpOAuthClientResetBodySchema,
  McpOAuthClientResetResponseSchema,
  type McpOAuthClientResetBodyType
} from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import {
  McpOAuthApiError,
  McpOAuthErrorCodeEnum,
  assertMcpOAuthEnabled,
  assertMcpOAuthRateLimit,
  createMcpOAuthApiHandler,
  decryptMcpOAuthAccessToken,
  decryptMcpOAuthRefreshToken,
  deregisterMcpOAuthClient,
  getMcpToolSetVersionDoc,
  getNodeMcpToolSet,
  resolveMcpOAuthNode,
  revokeMcpOAuthToken,
  sendMcpOAuthJson,
  updateMcpOAuthNodeFields
} from '@fastgpt/service/core/app/mcpOAuth';

/**
 * POST /api/core/app/mcpTools/oauth/client/reset（v2.4 §8.4）。
 *
 * 清空 client/token/server（seq+1）；保存了 RFC 7592 凭据时尽力注销。
 * 幂等：无可清内容时直接成功。
 */
async function handler(
  req: ApiRequestProps<McpOAuthClientResetBodyType>,
  res: NextApiResponse
) {
  assertMcpOAuthEnabled();
  const {
    body: { appId: requestedAppId, nodeId }
  } = parseApiInput({ req, bodySchema: McpOAuthClientResetBodySchema });

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
  await assertMcpOAuthRateLimit('client-reset-app', { appId });

  const version = await getMcpToolSetVersionDoc(appId);
  const node = resolveMcpOAuthNode(version, nodeId);
  const toolSet = getNodeMcpToolSet(node);
  if (toolSet?.authMode !== 'oauth') {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.notOAuthMode, {
      message: 'MCP toolset is not in oauth mode'
    });
  }

  const oauth = toolSet.oauth;

  const client = oauth?.client;
  const token = oauth?.token;
  const server = oauth?.server;

  const empty = () =>
    sendMcpOAuthJson({
      res: res as never,
      status: 200,
      body: McpOAuthClientResetResponseSchema.parse({
        schemaVersion: 1,
        reset: true,
        deregistered: false
      })
    });

  if (!client && !token && !server) return empty();

  const expectedSeq = oauth?.credentialSeq ?? 0;
  const written = await updateMcpOAuthNodeFields({
    appId,
    nodeId: node.nodeId,
    expectedCredentialSeq: expectedSeq,
    // clientSource 随 client 一起移除（$unset），不得写 null：schema 只允许
    // `cimd|dcr|manual`，null 会让 detail 的 legacy 校验整体失败（Stage K10）。
    unset: [
      'client',
      'clientSource',
      'token',
      'server',
      'lastError',
      'refreshLease',
      'revokeLease'
    ],
    incrementSeq: true
  });

  if (!written.matched) {
    const latestVersion = await getMcpToolSetVersionDoc(appId);
    const latestNode = resolveMcpOAuthNode(latestVersion, node.nodeId);
    const latestOAuth = getNodeMcpToolSet(latestNode)?.oauth;
    if (!latestOAuth?.client && !latestOAuth?.token && !latestOAuth?.server) return empty();
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.conflict, {
      message: 'OAuth credential changed while resetting client'
    });
  }

  let deregistered = false;
  try {
    deregistered = await deregisterMcpOAuthClient(client ?? undefined);
  } catch {
    deregistered = false;
  }

  const revocationEndpoint = server?.revocationEndpoint;
  if (revocationEndpoint && client && token) {
    const clientSecret = client.clientSecret
      ? decryptSecretValue(client.clientSecret)
      : undefined;
    const accessToken = decryptMcpOAuthAccessToken(token);
    const refreshToken = decryptMcpOAuthRefreshToken(token);
    const common = {
      revocationEndpoint,
      clientId: client.clientId,
      clientSecret: typeof clientSecret === 'string' ? clientSecret : undefined,
      authMethod: client.tokenEndpointAuthMethod
    };
    if (accessToken) {
      await revokeMcpOAuthToken({ ...common, token: accessToken, tokenTypeHint: 'access_token' });
    }
    if (refreshToken) {
      await revokeMcpOAuthToken({ ...common, token: refreshToken, tokenTypeHint: 'refresh_token' });
    }
  }

  return sendMcpOAuthJson({
    res: res as never,
    status: 200,
    body: McpOAuthClientResetResponseSchema.parse({
      schemaVersion: 1,
      reset: true,
      deregistered
    })
  });
}

export default NextAPI(createMcpOAuthApiHandler(handler));
