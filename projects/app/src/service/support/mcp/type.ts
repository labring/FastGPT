import type { McpAuthProxyType } from '@fastgpt/global/openapi/support/mcpServer/api';

export type toolCallProps = {
  key: string;
  toolName: string;
  inputs: Record<string, any>;
  authProxy?: McpAuthProxyType;
};
