import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GET, POST } from './request';
import { McpAuthProxyHeader } from '@fastgpt/global/support/mcp/type';

export const getTools = (key: string) => GET<Tool[]>('/support/mcp/server/toolList', { key });

export const callTool = (
  data: { key: string; toolName: string; inputs: Record<string, any> },
  authProxy?: { username?: string; tmbId?: string }
) =>
  POST('/support/mcp/server/toolCall', data, {
    headers: {
      ...(authProxy?.username && { [McpAuthProxyHeader.username]: authProxy.username }),
      ...(authProxy?.tmbId && { [McpAuthProxyHeader.tmbId]: authProxy.tmbId })
    }
  });
