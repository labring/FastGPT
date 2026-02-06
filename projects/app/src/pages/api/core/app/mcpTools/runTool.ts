import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MCPClient } from '@fastgpt/service/core/app/mcp';
import { getSecretValue } from '@fastgpt/service/common/secret/utils';
import {
  RunMcpToolBodySchema,
  type RunMcpToolBodyType,
  type RunMcpToolResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';

async function handler(
  req: ApiRequestProps<RunMcpToolBodyType>,
  _res: ApiResponseType<any>
): Promise<RunMcpToolResponseType> {
  const { url, toolName, headerSecret, params } = RunMcpToolBodySchema.parse(req.body);

  const mcpClient = new MCPClient({
    url,
    headers: getSecretValue({
      storeSecret: headerSecret
    })
  });

  return mcpClient.toolCall({ toolName, params });
}

export default NextAPI(handler);
