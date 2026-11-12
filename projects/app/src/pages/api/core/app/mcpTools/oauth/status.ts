import type { ApiRequestProps, NextApiResponse } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  McpOAuthStatusQuerySchema,
  McpOAuthStatusResponseSchema,
  type McpOAuthStatusQueryType
} from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import {
  McpOAuthApiError,
  McpOAuthErrorCodeEnum,
  assertMcpOAuthEnabled,
  createMcpOAuthApiHandler,
  deriveMcpOAuthStatus,
  getMcpToolSetVersionDoc,
  getNodeMcpToolSet,
  resolveMcpOAuthNode,
  sendMcpOAuthJson
} from '@fastgpt/service/core/app/mcpOAuth';
import { MongoMcpOAuthState } from '@fastgpt/service/core/app/mcpOAuth/schema';

/**
 * GET /api/core/app/mcpTools/oauth/status（v2.4 §8.2）。
 *
 * 只读投影：不发起任何网络请求、不返回 token/secret。
 */
async function handler(req: ApiRequestProps<any>, res: NextApiResponse) {
  assertMcpOAuthEnabled();
  const {
    query: { appId: requestedAppId, nodeId }
  } = parseApiInput({ req, querySchema: McpOAuthStatusQuerySchema });

  const { app } = await authApp({
    req,
    authToken: true,
    appId: requestedAppId,
    per: ReadPermissionVal
  });
  if (app.type !== AppTypeEnum.mcpToolSet) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.notToolset, {
      message: 'App is not an MCP toolset'
    });
  }

  const appId = String(app._id);
  const version = await getMcpToolSetVersionDoc(appId);
  const node = resolveMcpOAuthNode(version, nodeId);
  const toolSet = getNodeMcpToolSet(node);
  if (!toolSet) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.nodeNotFound, {
      message: 'MCP toolset config was not found'
    });
  }

  const now = Date.now();
  const hasPendingState = !!(await MongoMcpOAuthState.exists({
    appId,
    nodeId: node.nodeId,
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date(now) }
  }));

  const status = deriveMcpOAuthStatus({
    authMode: toolSet.authMode ?? 'headers',
    toolSet,
    oauth: toolSet.oauth,
    hasPendingState,
    now
  });

  return sendMcpOAuthJson({
    res: res as never,
    status: 200,
    body: McpOAuthStatusResponseSchema.parse(status)
  });
}

export default NextAPI(createMcpOAuthApiHandler(handler));
