import {
  type Method,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
  type AxiosRequestConfig
} from 'axios';
import { FastGPTProUrl } from '../system/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { createProxyAxios } from './axios';
import { getLogger, LogCategories } from '../logger';
import { assertRelativePath } from '../security/network';
import { serviceEnv } from '../../env';
import { FASTGPT_PRO_TOKEN_HEADER } from '@fastgpt/global/common/system/constants';

const logger = getLogger(LogCategories.HTTP.ERROR);

type ConfigType = {
  headers?: { [key: string]: string };
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
 * 请求开始
 */
function requestStart(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  if (config.headers) {
    delete config.headers['content-length'];
  }
  return config;
}

/**
 * 请求成功,检查请求头
 */
function responseSuccess(response: AxiosResponse<ResponseDataType>) {
  return response;
}
/**
 * 响应数据检查
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
 * 响应错误
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
 * 校验 FastGPT app 服务端访问 pro/admin 的内部请求配置。
 *
 * 本文件同时保留 GET/POST 等快捷封装和原始 axios config 两种入口；集中处理
 * PRO_URL、PRO_TOKEN 和相对路径校验，避免两条入口出现鉴权语义分叉。
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

  // plusRequest 仅用于访问商业版 Pro 服务,会自动携带内部 Pro token,SSRF 拦截已被显式关闭。
  // 强制要求相对路径,防止调用方传入绝对 URL 覆盖 baseURL 形成带高权限头的 SSRF。
  assertRelativePath(url, 'plusRequest');
};

/* 创建请求实例 */
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

/* 请求拦截 */
instance.interceptors.request.use(requestStart, (err) => Promise.reject(err));
/* 响应拦截 */
instance.interceptors.response.use(responseSuccess, (err) => Promise.reject(err));

export function request(url: string, data: any, config: ConfigType, method: Method): any {
  try {
    assertInternalProRequestConfig({ url });
  } catch (err) {
    return Promise.reject(err);
  }

  /* 去空 */
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
      ...config // 用户自定义配置，可以覆盖前面的配置
    })
    .then((res) => checkRes(res.data))
    .catch((err) => responseError(err));
}

/**
 * api请求方式
 * @param {String} url
 * @param {Any} params
 * @param {Object} config
 * @returns
 */
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
