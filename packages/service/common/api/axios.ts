import _, { type AxiosRequestConfig } from 'axios';
import { ProxyAgent } from 'proxy-agent';
import { isDevEnv } from '@fastgpt/global/common/system/constants';

export function createProxyAxios(config?: AxiosRequestConfig) {
  if (isDevEnv) {
    return _.create(config);
  }
  const agent = new ProxyAgent();

  return _.create({
    proxy: false,
    httpAgent: agent,
    httpsAgent: agent,
    ...config
  });
}

/** @see https://github.com/axios/axios/issues/4531 */
export const axios = createProxyAxios();
