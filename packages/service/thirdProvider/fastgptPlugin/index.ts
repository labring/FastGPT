import { createClient } from '@fastgpt/global/sdk/fastgpt-plugin';

export const PLUGIN_BASE_URL = process.env.PLUGIN_BASE_URL || '';
export const PLUGIN_TOKEN = process.env.PLUGIN_TOKEN || '';

export const pluginClient = createClient({
  baseUrl: PLUGIN_BASE_URL,
  token: PLUGIN_TOKEN
});
