import { usePluginDatasetRequest } from './plugin/api';
import type { PluginDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';

export const getApiDatasetRequest = async (pluginServer?: PluginDatasetServerType) => {
  if (!pluginServer?.pluginId) {
    return Promise.reject('Missing pluginDatasetServer');
  }

  return usePluginDatasetRequest(pluginServer);
};
