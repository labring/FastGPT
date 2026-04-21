import { pluginClient } from '.';
import type { I18nStringStrictType, AIProxyChannelsType } from '@fastgpt/global/sdk/fastgpt-plugin';

export const loadModelProviders = async (): Promise<{
  modelProviders: { provider: string; value: I18nStringStrictType; avatar: string }[];
  aiproxyChannels?: AIProxyChannelsType;
}> => {
  // 如果没有配置 plugin，跳过加载
  if (!process.env.PLUGIN_BASE_URL) {
    console.log('PLUGIN_BASE_URL not configured, skipping model providers load');
    return { modelProviders: [], aiproxyChannels: undefined };
  }
  return await pluginClient.getModelProviders();
};
