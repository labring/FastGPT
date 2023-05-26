import axios, { Method, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

interface ConfigType {
  headers?: { [key: string]: string };
  hold?: boolean;
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
  if (config.headers) {
    config.headers.rootkey = process.env.ROOT_KEY;
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
    return Promise.reject('服务器异常');
  } else if (data.code < 200 || data.code >= 400) {
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
  return Promise.reject(err);
}

/* 创建请求实例 */
export const instance = axios.create({
  timeout: 60000, // 超时时间
  baseURL: `http://localhost:${process.env.PORT || 3000}/api`,
  headers: {
    rootkey: process.env.ROOT_KEY
  }
});

/* 请求拦截 */
instance.interceptors.request.use(requestStart, (err) => Promise.reject(err));
/* 响应拦截 */
instance.interceptors.response.use(responseSuccess, (err) => Promise.reject(err));

function request(url: string, data: any, config: ConfigType, method: Method): any {
  /* 去空 */
  for (const key in data) {
    if (data[key] === null || data[key] === undefined) {
      delete data[key];
    }
  }

  return instance
    .request({
      url,
      method,
      data: method === 'GET' ? null : data,
      params: method === 'GET' ? data : null, // get请求不携带data，params放在url上
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
export function GET<T = { data: any }>(
  url: string,
  params = {},
  config: ConfigType = {}
): Promise<T> {
  return request(url, params, config, 'GET');
}

export function POST<T = { data: any }>(
  url: string,
  data = {},
  config: ConfigType = {}
): Promise<T> {
  return request(url, data, config, 'POST');
}

export function PUT<T = { data: any }>(
  url: string,
  data = {},
  config: ConfigType = {}
): Promise<T> {
  return request(url, data, config, 'PUT');
}

export function DELETE<T = { data: any }>(url: string, config: ConfigType = {}): Promise<T> {
  return request(url, {}, config, 'DELETE');
}
