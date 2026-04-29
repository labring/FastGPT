import _, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { ProxyAgent } from 'proxy-agent';
import { isDevEnv } from '@fastgpt/global/common/system/constants';
import { isInternalAddress, PRIVATE_URL_TEXT } from '../system/utils';
import { isAbsoluteUrl } from '../security/network';
import { SERVICE_LOCAL_HOST } from '../system/tools';

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

/**
 * 内部相对路径请求专用的 axios 实例:
 *  - baseURL 固定为本机 NextJS API
 *  - 不带 SSRF 拦截器(本机调用必然解析到 localhost,装拦截会把所有合法请求拦死)
 *  - 不复用 safe axios 的 ProxyAgent,保证内部回环不会被外部代理转走
 *
 * 仅在 url 是相对路径时使用;绝对 URL 必须走 safe `axios`。
 */
const internalAxios: AxiosInstance = _.create({
  baseURL: `http://${SERVICE_LOCAL_HOST}`
});

/**
 * 根据 URL 类型自动选择合适的 axios 实例,避免每个调用点重复
 * `isAbsoluteUrl ? safe : raw` 三元。
 *
 *  - 绝对 URL(`http(s)://...` 或 `//...`)→ safe `axios`(SSRF 拦截,拒绝内网/metadata)
 *  - 相对路径(`/api/...` 等)→ `internalAxios`(本机 baseURL,可信内部 API)
 *
 * 用法:
 * ```ts
 * const client = pickOutboundAxios(url);
 * const res = await client.get(url, { responseType: 'arraybuffer' });
 * ```
 */
export const pickOutboundAxios = (url: string): AxiosInstance => {
  return isAbsoluteUrl(url) ? axios : internalAxios;
};
