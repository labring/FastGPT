import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';

export type RunToolTestQuery = {};
export type RunToolTestBody = {
  params: Record<string, any>;
  url: string;
  toolName: string;
};
export type RunToolTestResponse = any;

async function handler(
  req: ApiRequestProps<RunToolTestBody, RunToolTestQuery>,
  res: ApiResponseType<RunToolTestResponse>
): Promise<RunToolTestResponse> {
  const { params, url, toolName } = req.body;

  const client = new Client({
    name: 'FastGPT-MCP-client',
    version: '1.0.0'
  });

  const result = await (async () => {
    try {
      const transport = new SSEClientTransport(new URL(url));
      await client.connect(transport);

      return await client.callTool({
        name: toolName,
        arguments: params
      });
    } catch (error) {
      console.error('Error running MCP tool test:', error);
      return Promise.reject(error);
    } finally {
      await client.close();
    }
  })();

  return result;
}

export default NextAPI(handler);
