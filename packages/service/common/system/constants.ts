export const FastGPTProUrl = process.env.PRO_URL ? `${process.env.PRO_URL}/api` : '';
export const FastGPTPluginUrl = process.env.PLUGIN_BASE_URL ? `${process.env.PLUGIN_BASE_URL}` : '';
// @ts-ignore
export const isFastGPTProService = () => !!global.systemConfig;
