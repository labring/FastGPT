import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { assertMCPUrlNotInternal, MCPClient } from '@fastgpt/service/core/app/mcp';
import { getSecretValue } from '@fastgpt/service/common/secret/utils';
import {
  RunMcpToolBodySchema,
  RunMcpToolResponseSchema,
  type RunMcpToolBodyType,
  type RunMcpToolResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps<RunMcpToolBodyType>): Promise<RunMcpToolResponseType> {
  await authCert({ req, authToken: true });

  const {
    body: { url, toolName, headerSecret, params }
  } = parseApiInput({
    req,
    bodySchema: RunMcpToolBodySchema
  });

  await assertMCPUrlNotInternal(url);

  const mcpClient = new MCPClient({
    url,
    headers: getSecretValue({
      storeSecret: headerSecret
    })
  });

  return RunMcpToolResponseSchema.parse(await mcpClient.toolCall({ toolName, params }));
}

export default NextAPI(handler);
