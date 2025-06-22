export enum PluginTypeEnum {
  folder = 'folder',
  custom = 'custom',
  http = 'http'
}
export const pluginTypeMap = {
  [PluginTypeEnum.folder]: {
    label: '文件夹',
    icon: 'file/fill/folder'
  },
  [PluginTypeEnum.custom]: {
    label: '自定义',
    icon: 'common/custom'
  },
  [PluginTypeEnum.http]: {
    label: 'HTTP',
    icon: 'common/http'
  }
};

export enum PluginSourceEnum {
  personal = 'personal', // this is a app.
  systemTool = 'systemTool', // FastGPT-plugin tools, pure code.
  commercial = 'commercial', // configured in Pro, with associatedPluginId. Specially, commercial-dalle3 is a systemTool
  // @deprecated
  community = 'community' // this is deprecated, will be replaced by systemTool
}
