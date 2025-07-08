export enum PluginSourceEnum {
  personal = 'personal', // this is a app.
  systemTool = 'systemTool', // FastGPT-plugin tools, pure code.
  commercial = 'commercial', // configured in Pro, with associatedPluginId. Specially, commercial-dalle3 is a systemTool
  // @deprecated
  community = 'community' // this is deprecated, will be replaced by systemTool
}
