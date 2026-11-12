import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { assertMCPUrlNotInternal, MCPClient } from '@fastgpt/service/core/app/mcp';
import { getSecretValue } from '@fastgpt/service/common/secret/utils';
import {
  GetMcpToolsBodySchema,
  GetMcpToolsResponseSchema,
  type GetMcpToolsBodyType,
  type GetMcpToolsResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  getMcpToolSetVersionDoc,
  getNodeMcpToolSet,
  resolveMcpOAuthNode
} from '@fastgpt/service/core/app/mcpOAuth/credential';
import { withMcpOAuthRetry } from '@fastgpt/service/core/app/mcpOAuth/runtime';
import { McpOAuthApiError } from '@fastgpt/service/core/app/mcpOAuth/errors';
import { McpOAuthErrorCodeEnum } from '@fastgpt/global/core/app/tool/mcpTool/oauth';

async function handler(
  req: ApiRequestProps<GetMcpToolsBodyType>
): Promise<GetMcpToolsResponseType> {
  const {
    body: { appId, nodeId, url, headerSecret }
  } = parseApiInput({
    req,
    bodySchema: GetMcpToolsBodySchema
  });

  if (!appId) {
    // 无 appId 保持旧路径：直接用请求中的 url/headerSecret，不读库、不刷新。
    await authCert({ req, authToken: true });
    if (!url) throw new McpOAuthApiError(McpOAuthErrorCodeEnum.urlMismatch);

    await assertMCPUrlNotInternal(url);
    const mcpClient = new MCPClient({
      url,
      headers: getSecretValue({ storeSecret: headerSecret })
    });
    return GetMcpToolsResponseSchema.parse(await mcpClient.getTools());
  }

  const { app } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });
  if (app.type !== AppTypeEnum.mcpToolSet) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.notToolset, {
      message: 'App is not an MCP toolset'
    });
  }

  const version = await getMcpToolSetVersionDoc(String(appId));
  const node = resolveMcpOAuthNode(version, nodeId);
  const toolSet = getNodeMcpToolSet(node);
  if (!toolSet?.url) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.nodeNotFound, {
      message: 'MCP toolset config was not found'
    });
  }
  if (url && url !== toolSet.url) {
    throw new McpOAuthApiError(McpOAuthErrorCodeEnum.urlMismatch, {
      message: 'Request URL does not match the stored toolset URL'
    });
  }

  const effectiveNodeId = String(node.nodeId);
  await assertMCPUrlNotInternal(toolSet.url);

  if (toolSet.authMode === 'oauth') {
    return GetMcpToolsResponseSchema.parse(
      await withMcpOAuthRetry({
        appId: String(appId),
        nodeId: effectiveNodeId,
        run: async (headers) => {
          const mcpClient = new MCPClient({
            url: toolSet.url!,
            headers
          });
          return mcpClient.getTools();
        }
      })
    );
  }

  // appId 分支只使用已发布节点中的密钥，忽略请求体传入的 headerSecret。
  const headers = getSecretValue({
    storeSecret: toolSet.headerSecret as any
  });
  const mcpClient = new MCPClient({
    url: toolSet.url,
    headers
  });
  return GetMcpToolsResponseSchema.parse(await mcpClient.getTools());
}

export default NextAPI(handler);
