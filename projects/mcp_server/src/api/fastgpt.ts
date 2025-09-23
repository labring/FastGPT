import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GET, POST } from './request';

export const getTools = (key: string) => GET<Tool[]>('/support/mcp/server/toolList', { key });

export const callTool = (data: { key: string; toolName: string; inputs: Record<string, any> }) =>
  POST('/support/mcp/server/toolCall', data);
