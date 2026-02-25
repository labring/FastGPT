import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MCPClient } from '@fastgpt/service/core/app/mcp';
import { getSecretValue } from '@fastgpt/service/common/secret/utils';
import {
  GetMcpToolsBodySchema,
  GetMcpToolsResponseSchema,
  type GetMcpToolsBodyType,
  type GetMcpToolsResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';

async function handler(
  req: ApiRequestProps<GetMcpToolsBodyType>,
  _res: ApiResponseType<any>
): Promise<GetMcpToolsResponseType> {
  const { url, headerSecret } = GetMcpToolsBodySchema.parse(req.body);

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
