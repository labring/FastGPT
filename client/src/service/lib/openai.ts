import { UserModelSchema } from '@/types/mongoSchema';
import { Configuration, OpenAIApi } from 'openai';

export const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
export const baseUrl = process.env.ONEAPI_URL || openaiBaseUrl;

export const systemAIChatKey = process.env.CHAT_API_KEY || '';

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
