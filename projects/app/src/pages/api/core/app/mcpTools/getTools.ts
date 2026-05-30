import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { assertMCPUrlNotInternal, MCPClient } from '@fastgpt/service/core/app/mcp';
import { getSecretValue } from '@fastgpt/service/common/secret/utils';
import {
  GetMcpToolsBodySchema,
  GetMcpToolsResponseSchema,
  type GetMcpToolsBodyType,
  type GetMcpToolsResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps<GetMcpToolsBodyType>
): Promise<GetMcpToolsResponseType> {
  await authCert({ req, authToken: true });

  const {
    body: { url, headerSecret }
  } = parseApiInput({
    req,
    bodySchema: GetMcpToolsBodySchema
  });

  await assertMCPUrlNotInternal(url);

  const mcpClient = new MCPClient({
    url,
    headers: getSecretValue({
      storeSecret: headerSecret
    })
  });

  const result = await mcpClient.getTools();
  return GetMcpToolsResponseSchema.parse(result);
}

export default NextAPI(handler);
