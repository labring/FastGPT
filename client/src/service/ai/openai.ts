import { UserModelSchema } from '@/types/mongoSchema';
import { Configuration, OpenAIApi } from 'openai';

export const openaiBaseUrl = 'https://api.openai.com/v1';
export const baseUrl = process.env.ONEAPI_URL || process.env.OPENAI_BASE_URL || openaiBaseUrl;

export const systemAIChatKey = process.env.ONEAPI_KEY || process.env.OPENAIKEY || '';

export const getAIChatApi = (props?: UserModelSchema['openaiAccount']) => {
  return new OpenAIApi(
    new Configuration({
      basePath: props?.baseUrl || baseUrl,
      apiKey: props?.key || systemAIChatKey
    })
  );
};

/* openai axios config */
export const axiosConfig = (props?: UserModelSchema['openaiAccount']) => {
  return {
    baseURL: props?.baseUrl || baseUrl, // 此处仅对非 npm 模块有效
    httpsAgent: global.httpsAgent,
    headers: {
      Authorization: `Bearer ${props?.key || systemAIChatKey}`,
      auth: process.env.OPENAI_BASE_URL_AUTH || ''
    }
  };
};
