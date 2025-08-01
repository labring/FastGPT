import createClient from '@fastgpt-sdk/plugin';

export const BASE_URL = process.env.PLUGIN_BASE_URL || '';
export const TOKEN = process.env.PLUGIN_TOKEN || '';

export const pluginClient = createClient({
  baseUrl: BASE_URL,
  token: TOKEN
});
