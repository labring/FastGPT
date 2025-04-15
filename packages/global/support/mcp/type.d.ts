export type McpKeyType = {
  _id: string;
  key: string;
  teamId: string;
  tmbId: string;
  apps: McpAppType[];
};

export type McpAppType = {
  id: string;
  name?: string;
  intro?: string;
};
