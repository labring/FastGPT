import axios, {
  Method,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosRequestConfig
} from 'axios';
import { FastGPTProUrl } from '../system/constants';
import type {
  AuthOutLinkChatProps,
  AuthOutLinkLimitProps,
  AuthOutLinkInitProps,
  AuthOutLinkResponse
} from '@fastgpt/global/support/outLink/api.d';

interface ConfigType {
  headers?: { [key: string]: string };
  hold?: boolean;
  timeout?: number;
}
interface ResponseDataType {
  code: number;
  message: string;
  data: any;
}

/**
 * 请求开始
 */
function requestStart(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
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
    console.log('error->', data, 'data is empty');
    return Promise.reject('服务器异常');
  } else if (data?.code && (data.code < 200 || data.code >= 400)) {
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
    return Promise.reject(err?.response?.data);
  }
  return Promise.reject(err);
}

/* 创建请求实例 */
const instance = axios.create({
  timeout: 60000, // 超时时间
  headers: {
    'content-type': 'application/json',
    'Cache-Control': 'no-cache',
    rootkey: process.env.ROOT_KEY
  },
  baseURL: 'http://192.168.8.143:3000'
});

/* 请求拦截 */
instance.interceptors.request.use(requestStart, (err) => Promise.reject(err));
/* 响应拦截 */
instance.interceptors.response.use(responseSuccess, (err) => Promise.reject(err));

export function request(url: string, data: any, config: ConfigType, method: Method): any {
  /* 去空 */
  for (const key in data) {
    if (data[key] === null || data[key] === undefined) {
      delete data[key];
    }
  }
  console.log('[DEBUG] Making request:', {
    url,
    method,
    baseURL: instance.defaults.baseURL
  });

  return instance
    .request({
      url,
      method,
      data: ['POST', 'PUT'].includes(method) ? data : null,
      params: !['POST', 'PUT'].includes(method) ? data : null,
      ...config // 用户自定义配置，可以覆盖前面的配置
    })
    .then((res) => checkRes(res.data))
    .catch((err) => {
      console.error('[ERROR] Request failed:', {
        url,
        method,
        error: err?.message,
        stack: err?.stack
      });
      return responseError(err);
    });
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

export const plusRequest = (config: AxiosRequestConfig) =>
  instance.request({
    ...config,
    baseURL: FastGPTProUrl
  });

export async function authOutLinkInit(
  data: AuthOutLinkInitProps & { shareId: string },
  token?: string
): Promise<AuthOutLinkResponse> {
  // 先获取鉴权token
  try {
    if (!token) {
      return GET<AuthOutLinkResponse>('/api/core/chat/outLink/init', data);
    }

    // 根据环境使用不同的认证服务地址
    const baseUrl =
      process.env.NODE_ENV === 'production'
        ? 'http://172.28.17.114' // 生产环境
        : 'http://192.168.8.194'; // 测试环境

    // 获取token
    const validateUrl = `${baseUrl}/api/ky/sys/validate-token?token=${encodeURIComponent(token)}`;
    const response = await fetch(validateUrl);
    const authResult = await response.json();

    if (!authResult.success) {
      return Promise.reject('Token validation failed');
    }

    // 使用验证后的token调用FastGPT API
    return GET<AuthOutLinkResponse>('/api/core/chat/outLink/init', data, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (err) {
    console.error('Auth error:', err);
    return Promise.reject(err);
  }
}

export function authOutLinkChatLimit(
  data: AuthOutLinkLimitProps,
  token?: string
): Promise<AuthOutLinkResponse> {
  if (!token) {
    return POST<AuthOutLinkResponse>('/api/core/chat/outLink/chatStart', data);
  }

  return POST<AuthOutLinkResponse>('/api/core/chat/outLink/chatStart', data, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}
