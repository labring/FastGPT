#!/usr/bin/env node
import './init';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';

import { callTool, getTools } from './api/fastgpt';
import { addLog } from './utils/log';
import { getErrText } from '@fastgpt/global/common/error/utils';

const app = express();

const transportMap: Record<string, SSEServerTransport> = {};

app.get('/:key/sse', async (req, res) => {
  const { key } = req.params;

  const transport = new SSEServerTransport(`/${key}/messages`, res);

  transportMap[transport.sessionId] = transport;

  // Create server
  const server = new Server(
    {
      name: 'fastgpt-mcp-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  transport.onclose = () => {
    addLog.info(`Transport closed ${transport.sessionId}`);
    delete transportMap[transport.sessionId];
  };
  transport.onerror = (err) => {
    addLog.error(`Transport error ${transport.sessionId}`, err);
  };
  server.onclose = () => {
    addLog.info(`Server closed ${transport.sessionId}`);
    delete transportMap[transport.sessionId];
  };
  server.onerror = (err) => {
    addLog.error(`Server error ${transport.sessionId}`, err);
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: await getTools(key)
  }));

  const handleToolCall = async (
    name: string,
    args: Record<string, any>
  ): Promise<CallToolResult> => {
    try {
      addLog.info(`Call tool: ${name} with args: ${JSON.stringify(args)}`);
      const result = await callTool({ key, toolName: name, inputs: args });

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
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(request.params.name, request.params.arguments ?? {})
  );

  await server.connect(transport);
  addLog.info(`Server connected: ${transport.sessionId}`);
});

app.post('/:key/messages', (req, res) => {
  const { sessionId } = req.query as { sessionId: string };

  const transport = transportMap[sessionId];
  if (transport) {
    transport.handlePostMessage(req, res);
  }
});

const PORT = process.env.PORT || 3000;
app
  .listen(PORT, () => {
    addLog.info(`Server is running on port ${PORT}`);
  })
  .on('error', (err) => {
    addLog.error(`Server error`, err);
  });
