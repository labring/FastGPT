export enum AppToolSourceEnum {
  personal = 'personal', // this is a app.
  systemTool = 'systemTool', // FastGPT-plugin tools, pure code.
  commercial = 'commercial', // configured in Pro, with associatedPluginId. Specially, commercial-dalle3 is a systemTool
  mcp = 'mcp', // mcp
  http = 'http', // http
  // @deprecated
  community = 'community' // this is deprecated, will be replaced by systemTool
}
