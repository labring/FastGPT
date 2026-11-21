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
  assertMcpOAuthRateLimit,
  createMcpOAuthApiHandler,
  getMcpOAuthRouteConfig,
  sendMcpOAuthJson,
  serializeMcpOAuthBindCookie,
  startMcpOAuthAuthorization
} from '@fastgpt/service/core/app/mcpOAuth';

/**
 * POST /api/core/app/mcpTools/oauth/start（v2.4 §4.4 + 决策 D8）。
 *
 * 发现、client 选择（含 CIMD 失败后的一次性自动降级 DCR）、写回节点、
 * 写一次性台账都在 `startMcpOAuthAuthorization` 内完成；台账写失败不返回 URL。
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

  const started = await startMcpOAuthAuthorization({
    appId,
    teamId,
    tmbId,
    nodeId,
    clientMode,
    requestedScope,
    manualClient
  });

  res.setHeader(
    'Set-Cookie',
    serializeMcpOAuthBindCookie({
      appId,
      value: started.bindCookieValue,
      feDomain: config.feDomain
    })
  );

  return sendMcpOAuthJson({
    res: res as never,
    status: 200,
    body: McpOAuthStartResponseSchema.parse({
      schemaVersion: 1,
      authorizationUrl: started.authorizationUrl,
      clientMode: started.clientMode,
      clientSource: started.clientSource,
      issuer: started.issuer,
      resource: started.resource,
      ...(started.scope !== undefined ? { requestedScope: started.scope } : {}),
      expiresAt: started.expiresAt
    })
  });
}

export default NextAPI(createMcpOAuthApiHandler(handler));
