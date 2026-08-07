export type McpKeyType = {
  _id: string;
  key: string;
  teamId: string;
  tmbId: string;
  apps: McpAppType[];
  name: string;
  authProxy: boolean;
};

export type McpAppType = {
  appId: string;
  appName?: string;
  toolName: string;
  description: string;
};

export const McpAuthProxyHeader = {
  username: 'x-fastgpt-auth-proxy-username',
  tmbId: 'x-fastgpt-auth-proxy-tmb-id'
} as const;
