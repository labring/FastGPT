import { useApiDatasetRequest } from './custom/api';
import { usePluginDatasetRequest } from './plugin/api';
import type { PluginDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';

export const getApiDatasetRequest = async (pluginServer?: PluginDatasetServerType) => {
  if (!pluginServer?.pluginId) {
    return Promise.reject('Missing pluginDatasetServer');
  }

  const { pluginId, config } = pluginServer;

  if (pluginId === 'custom-api') {
    return useApiDatasetRequest({
      apiServer: {
        baseUrl: config.baseUrl,
        authorization: config.authorization,
        basePath: config.basePath
      }
    });
  }

  // 其他的统一发送到 fastgpt-plugin 处理
  return usePluginDatasetRequest(pluginServer);
};
