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
  toolName: string;
  toolAlias?: string;
  description: string;
};
