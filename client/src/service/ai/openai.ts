import { Configuration, OpenAIApi } from 'openai';

export const openaiBaseUrl = 'https://api.openai.com/v1';
export const baseUrl = process.env.ONEAPI_URL || process.env.OPENAI_BASE_URL || openaiBaseUrl;

export const systemAIChatKey = process.env.ONEAPI_KEY || process.env.OPENAIKEY || '';

export const getAIChatApi = (props?: { base?: string; apikey?: string }) => {
  return new OpenAIApi(
    new Configuration({
      basePath: props?.base || baseUrl,
      apiKey: props?.apikey || systemAIChatKey
    })
  );
};

/* openai axios config */
export const axiosConfig = (props?: { base?: string; apikey?: string }) => {
  return {
    baseURL: props?.base || baseUrl, // 此处仅对非 npm 模块有效
    httpsAgent: global.httpsAgent,
    headers: {
      Authorization: `Bearer ${props?.apikey || systemAIChatKey}`,
      auth: process.env.OPENAI_BASE_URL_AUTH || ''
    }
  };
};
