import _, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { ProxyAgent } from 'proxy-agent';
import { isDevEnv } from '@fastgpt/global/common/system/constants';
import { isInternalAddress, PRIVATE_URL_TEXT } from '../system/utils';

const addSSRFInterceptor = (instance: AxiosInstance) => {
  instance.interceptors.request.use(async (config) => {
    const requestUrl = (() => {
      try {
        return new URL(config.url || '', config.baseURL).toString();
      } catch {
        return;
      }
    })();
    if (!requestUrl) return config;

    if (await isInternalAddress(requestUrl)) {
      return Promise.reject(new Error(PRIVATE_URL_TEXT));
    }

    return config;
  });

  return instance;
};

export function createProxyAxios(config?: AxiosRequestConfig, ssrfCheck = true) {
  const agent = new ProxyAgent();

  const instance = isDevEnv
    ? _.create(config)
    : _.create({
        proxy: false,
        httpAgent: agent,
        httpsAgent: agent,
        ...config
      });

  return ssrfCheck ? addSSRFInterceptor(instance) : instance;
}

/** @see https://github.com/axios/axios/issues/4531 */
export const axios = createProxyAxios();
