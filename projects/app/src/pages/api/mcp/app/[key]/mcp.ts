import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { addLog } from '@fastgpt/service/common/system/log';
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types';
import { callMcpServerTool, getMcpServerTools } from '@/service/support/mcp/utils';
import { type toolCallProps } from '@/service/support/mcp/type';
import { getErrText } from '@fastgpt/global/common/error/utils';

export type mcpQuery = { key: string };

export type mcpBody = toolCallProps;

const handlePost = async (req: ApiRequestProps<mcpBody, mcpQuery>, res: ApiResponseType<any>) => {
  const key = req.query.key;
  const server = new Server(
    {
      name: 'fastgpt-mcp-server-http-streamable',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  res.on('close', () => {
    addLog.debug('[MCP server] Close connection');
    transport.close();
    server.close();
  });

  try {
    const tools = await getMcpServerTools(key);
    // Register list tools
    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools
    }));

    // Register call tool
    const handleToolCall = async (
      name: string,
      args: Record<string, any>
    ): Promise<CallToolResult> => {
      try {
        addLog.debug(`Call tool: ${name} with args: ${JSON.stringify(args)}`);
        const result = await callMcpServerTool({ key, toolName: name, inputs: args });

        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result)
            }
          ],
          isError: false
        };
      } catch (error) {
        return {
          message: getErrText(error),
          content: [],
          isError: true
        };
      }
    };
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return handleToolCall(request.params.name, request.params.arguments ?? {});
    });

    // Connect to transport
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    addLog.error('[MCP server] Error handling MCP request:', error);
    if (!res.writableFinished) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
};

async function handler(req: ApiRequestProps<mcpBody, mcpQuery>, res: ApiResponseType<any>) {
  const method = req.method;

  if (method === 'POST') {
    return handlePost(req, res);
  }

  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.'
      },
      id: null
    })
  );
  return;
}

export default handler;
