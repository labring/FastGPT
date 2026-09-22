import { type Method, type InternalAxiosRequestConfig, type AxiosRequestConfig } from 'axios';
import { FastGPTProUrl } from '../../common/system/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { createProxyAxios } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';
import { assertRelativePath } from '../../common/security/network';
import { serviceEnv } from '../../env';
import { FASTGPT_PRO_TOKEN_HEADER } from '@fastgpt/global/common/system/constants';

const logger = getLogger(LogCategories.HTTP.ERROR);

export type ConfigType = {
  headers?: AxiosRequestConfig['headers'];
  hold?: boolean;
  timeout?: number;
};
type ResponseDataType = {
  code: number;
  message: string;
  data: any;
  errorType?: string;
};

/**
 * 请求开始时清理由上游请求携带的 content-length，避免转发请求体长度不匹配。
 */
function requestStart(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (config.headers) {
    delete config.headers['content-length'];
  }
  return config;
}

/**
 * 将 Pro 服务的业务错误转换为 FastGPT 服务端统一可处理的错误类型。
 */
function checkRes(data: ResponseDataType) {
  if (data === undefined) {
    logger.error('Plus request response is empty', { data });
    return Promise.reject('服务器异常');
  } else if (data?.code && (data.code < 200 || data.code >= 400)) {
    if (data.errorType === 'UserError') return Promise.reject(new UserError(data.message));
    return Promise.reject(data);
  }
  return data.data;
}

/**
 * 将 Axios 错误转换为 Pro 服务响应中的业务错误，保留原有错误结构供调用方处理。
 */
function responseError(err: any) {
  if (!err) {
    return Promise.reject({ message: '未知错误' });
  }
  if (typeof err === 'string') {
    return Promise.reject({ message: err });
  }

  if (err?.response?.data) {
    if (err.response.data.errorType === 'UserError') {
      return Promise.reject(new UserError(err.response.data.message));
    }
    return Promise.reject(err?.response?.data);
  }
  return Promise.reject(err);
}

/**
 * 校验 FastGPT 主服务访问 Pro 服务的内部请求配置，并阻止绝对 URL 形成高权限 SSRF。
 */
const assertInternalProRequestConfig = ({ url }: { url?: string }) => {
  if (!FastGPTProUrl) {
    logger.warn('FastGPT Pro API is not configured', { url });
    throw new UserError('The request was denied...');
  }
  if (!serviceEnv.PRO_TOKEN) {
    logger.error('FastGPT Pro token is not configured', { url });
    throw new UserError('FastGPT Pro token is not configured');
  }

  assertRelativePath(url, 'plusRequest');
};

const instance = createProxyAxios(
  {
    timeout: 60000,
    headers: {
      'content-type': 'application/json',
      'Cache-Control': 'no-cache',
      [FASTGPT_PRO_TOKEN_HEADER]: serviceEnv.PRO_TOKEN
    }
  },
  false
);

instance.interceptors.request.use(requestStart, (err) => Promise.reject(err));
instance.interceptors.response.use(
  (response) => response,
  (err) => Promise.reject(err)
);

export function request(url: string, data: any, config: ConfigType, method: Method): any {
  try {
    assertInternalProRequestConfig({ url });
  } catch (err) {
    return Promise.reject(err);
  }

  for (const key in data) {
    if (data[key] === null || data[key] === undefined) {
      delete data[key];
    }
  }

  return instance
    .request({
      baseURL: FastGPTProUrl,
      url,
      method,
      data: ['POST', 'PUT'].includes(method) ? data : null,
      params: !['POST', 'PUT'].includes(method) ? data : null,
      ...config
    })
    .then((res) => checkRes(res.data))
    .catch((err) => responseError(err));
}

export function GET<T = undefined>(url: string, params = {}, config: ConfigType = {}): Promise<T> {
  return request(url, params, config, 'GET');
}

export function POST<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'POST');
}

export function PUT<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'PUT');
}

export function DELETE<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'DELETE');
}

/**
 * 转发需要保留完整 Axios 响应的 Pro 接口，例如外链平台回调。
 */
export const plusRequest = (config: AxiosRequestConfig) => {
  try {
    assertInternalProRequestConfig({ url: config.url });
  } catch (err) {
    return Promise.reject(err);
  }
  return instance.request({
    ...config,
    baseURL: FastGPTProUrl
  });
};
