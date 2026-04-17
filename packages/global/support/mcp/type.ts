export type McpKeyType = {
  _id: string;
  key: string;
  teamId: string;
  tmbId: string;
  apps: McpAppType[];
  name: string;
};

export type McpAppType = {
  appId: string;
  appName?: string;
  toolName: string;
  description: string;
};
