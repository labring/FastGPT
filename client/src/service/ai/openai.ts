import { Configuration, OpenAIApi } from 'openai';

export const getSystemOpenAiKey = () => {
  return process.env.ONEAPI_KEY || '';
};

export const getOpenAIApi = () => {
  return new OpenAIApi(
    new Configuration({
      basePath: process.env.ONEAPI_URL
    })
  );
};

/* openai axios config */
export const axiosConfig = () => {
  return {
    baseURL: process.env.ONEAPI_URL, // 此处仅对非 npm 模块有效
    httpsAgent: global.httpsAgent,
    headers: {
      Authorization: `Bearer ${getSystemOpenAiKey()}`,
      auth: process.env.OPENAI_BASE_URL_AUTH || ''
    }
  };
};
