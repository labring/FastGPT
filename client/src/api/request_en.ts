import axios, { Method, AxiosRequestConfig, AxiosResponse } from 'axios';
import { clearToken, getToken } from '@/utils/user';
import { TOKEN_ERROR_CODE } from '@/service/errorCode';

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
 * Request start
 */
function requestStart(config: AxiosRequestConfig): AxiosRequestConfig {
  if (config.headers) {
    config.headers.token = getToken();
  }

  return config;
}

/**
 * Request success, check response headers
 */
function responseSuccess(response: AxiosResponse<ResponseDataType>): AxiosResponse<ResponseDataType> {
  return response;
}

/**
 * Check response data
 */
function checkRes(data: ResponseDataType): any {
  if (data === undefined) {
    console.log('error->', data, 'data is empty');
    return Promise.reject('Server exception');
  } else if (data.code < 200 || data.code >= 400) {
    return Promise.reject(data);
  }
  return data.data;
}

/**
 * Response error
 */
function responseError(err: any) {
  console.log('error->', 'Request error', err);

  if (!err) {
    return Promise.reject({ message: 'Unknown error' });
  }
  if (typeof err === 'string') {
    return Promise.reject({ message: err });
  }
  // Error response exists
  if (err?.code in TOKEN_ERROR_CODE) {
    clearToken();
    window.location.replace(
      `/login?lastRoute=${encodeURIComponent(location.pathname + location.search)}`
    );
    return Promise.reject({ message: 'Token expired, please log in again' });
  }
  if (err?.response?.data) {
    return Promise.reject(err?.response?.data);
  }
  return Promise.reject(err);
}

/* Create axios instance */
const instance = axios.create({
  timeout: 60000, // Timeout duration
  headers: {
    'content-type': 'application/json'
  }
});

/* Request interceptor */
instance.interceptors.request.use(requestStart, (err) => Promise.reject(err));
/* Response interceptor */
instance.interceptors.response.use(responseSuccess, (err) => Promise.reject(err));

function request(url: string, data: any, config: ConfigType, method: Method): any {
  /* Remove null or undefined values */
  for (const key in data) {
    if (data[key] === null || data[key] === undefined) {
      delete data[key];
    }
  }

  return instance
    .request({
      baseURL: '/api',
      url,
      method,
      data: ['POST', 'PUT'].includes(method) ? data : null,
      params: !['POST', 'PUT'].includes(method) ? data : null,
      ...config // User-defined configuration that can override previous configurations
    })
    .then((res) => checkRes(res.data))
    .catch((err) => responseError(err));
}

/**
 * API request methods
 * @param {String} url
 * @param {Any} params
 * @param {Object} config
 * @returns
 */
export function GET<T>(url: string, params = {}, config: ConfigType = {}): Promise<T> {
  return request(url, params, config, 'GET');
}

export function POST<T>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'POST');
}

export function PUT<T>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'PUT');
}

export function DELETE<T>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'DELETE');
}
