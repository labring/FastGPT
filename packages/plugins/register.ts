import { cloneDeep } from 'lodash';

export const getSystemPluginTemplates = () => {
  if (!global.systemPlugins) return [];

  return cloneDeep(global.systemPlugins);
};
