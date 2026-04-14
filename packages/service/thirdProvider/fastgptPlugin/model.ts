import { pluginClient } from '.';

export const loadModelProviders = async () => {
  // 如果没有配置 plugin，跳过加载
  if (!process.env.PLUGIN_BASE_URL) {
    console.log('PLUGIN_BASE_URL not configured, skipping model providers load');
    return { modelProviders: [], aiproxyIdMap: {} };
  }
  return await pluginClient.getModelProviders();
};
