import { FastGPTPluginClient } from '@fastgpt/global/sdk/fastgpt-plugin';
import { serviceEnv } from '../../env';

export const PLUGIN_BASE_URL = serviceEnv.PLUGIN_BASE_URL ?? '';
export const PLUGIN_TOKEN = serviceEnv.PLUGIN_TOKEN;

export const pluginClient = new FastGPTPluginClient({
  baseUrl: PLUGIN_BASE_URL,
  token: PLUGIN_TOKEN
});
