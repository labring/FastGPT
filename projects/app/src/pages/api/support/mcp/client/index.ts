import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCPToolsOperationTypeEnum } from '@fastgpt/global/core/app/constants';

export type getToolsBody = { url: string };

export type RunToolTestBody = {
  params: Record<string, any>;
  url: string;
  toolName: string;
};

export type MCPToolsQuery = {};

export type MCPToolsBody =
  | ({ type: MCPToolsOperationTypeEnum.GET_TOOLS } & getToolsBody)
  | ({ type: MCPToolsOperationTypeEnum.TOOL_TEST } & RunToolTestBody);

export type MCPToolsResponse = {};

async function handler(
  req: ApiRequestProps<MCPToolsBody, MCPToolsQuery>,
  res: ApiResponseType<MCPToolsResponse>
): Promise<MCPToolsResponse> {
  const { url, type } = req.body;

  const client = await (async () => {
    try {
      const client = new Client({
        name: 'FastGPT-MCP-streamable-http-client',
        version: '1.0.0'
      });
      const transport = new StreamableHTTPClientTransport(new URL(url));
      await client.connect(transport);
      return client;
    } catch (error) {
      const client = new Client({
        name: 'FastGPT-MCP-sse-client',
        version: '1.0.0'
      });
      const sseTransport = new SSEClientTransport(new URL(url));
      await client.connect(sseTransport);
      return client;
    }
  })();

  if (type === MCPToolsOperationTypeEnum.GET_TOOLS) {
    return await getTools(client);
  }

  if (type === MCPToolsOperationTypeEnum.TOOL_TEST) {
    return await runToolTest(client, req.body);
  }

  return Promise.reject('No valid server configuration provided');
}

export default NextAPI(handler);

const getTools = async (client: Client) => {
  try {
    const response = await client.listTools();

    return response.tools || [];
  } catch (error) {
    console.error('Error fetching MCP tools:', error);
    return Promise.reject(error);
  } finally {
    await client.close();
  }
};

const runToolTest = async (client: Client, body: RunToolTestBody) => {
  const { params, toolName } = body;

  try {
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
};
