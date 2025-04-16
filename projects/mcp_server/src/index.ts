#!/usr/bin/env node
import './init.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolResult
} from '@modelcontextprotocol/sdk/types.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';

import { callTool, getTools } from './api/fastgpt.js';

const app = express();

const transportMap: Record<string, SSEServerTransport> = {};

app.get('/:key/sse', async (req, res) => {
  const { key } = req.params;

  const transport = new SSEServerTransport(`/${key}/messages`, res);

  transport.onclose = () => {
    console.log(`Transport ${transport.sessionId} closed`);
    delete transportMap[transport.sessionId];
  };
  transport.onerror = (err) => {
    console.log(`Transport ${transport.sessionId} error`, err);
  };

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

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: await getTools(key)
  }));

  const handleToolCall = async (
    name: string,
    args: Record<string, any>
  ): Promise<CallToolResult> => {
    try {
      console.log(`Call tool: ${name} with args: ${JSON.stringify(args)}`);
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
        content: [
          {
            type: 'text',
            text: 'error'
          }
        ],
        isError: true
      };
    }
  };
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(request.params.name, request.params.arguments ?? {})
  );

  await server.connect(transport);
  console.log(`Server connected: ${transport.sessionId}`);
});

app.post('/:key/messages', (req, res) => {
  const { sessionId } = req.query as { sessionId: string };

  const transport = transportMap[sessionId];
  if (transport) {
    transport.handlePostMessage(req, res);
  }
});

const PORT = process.env.PORT || 3005;
app
  .listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  })
  .on('error', (err) => {
    console.log(err);
  });
