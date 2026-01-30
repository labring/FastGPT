import type { PluginDatasetServerType } from './type';

// 过滤掉敏感信息（如 token、secret 等）
export const filterPluginDatasetServerPublicData = (
  pluginDatasetServer?: PluginDatasetServerType
): PluginDatasetServerType | undefined => {
  if (!pluginDatasetServer?.pluginId) return undefined;

  const { pluginId, config } = pluginDatasetServer;

  // 敏感字段列表（支持部分匹配，不区分大小写）
  const sensitiveFields = ['token', 'secret', 'auth'];

  // 过滤掉敏感字段
  const filteredConfig: Record<string, any> = {};
  for (const [key, value] of Object.entries(config || {})) {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      filteredConfig[key] = '';
    } else {
      filteredConfig[key] = value;
    }
  }

  return {
    pluginId,
    config: filteredConfig
  };
};
