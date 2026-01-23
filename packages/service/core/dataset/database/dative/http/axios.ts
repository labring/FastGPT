import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse
} from 'axios';
import { addLog } from '../../../../../common/system/log';
import { parseDativeErrorResponse, dativeUrl } from '../utils';

function requestStart(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  addLog.debug('Dative request', {
    url: config.url,
    method: config.method,
    endpoint: config.url
  });
  return config;
}

function responseSuccess(response: AxiosResponse<any>) {
  addLog.debug('Dative response success', {
    url: response.config.url,
    status: response.status
  });
  return response.data; // 直接返回 data，简化业务层调用
}

function responseError(err: any) {
  if (!err) {
    addLog.error('Dative unknown error', { error: 'Empty error object' });
    return Promise.reject({ message: 'Unknown Dative error' });
  }

  // Network error (connection failed, timeout, etc.)
  if (!err.response) {
    const errorMsg = err.message || String(err);
    addLog.error('Dative network error', {
      error: errorMsg,
      code: err.code,
      url: err.config?.url
    });
    return Promise.reject({
      message: `Dative service connection failed: ${errorMsg}`,
      statusCode: undefined,
      endpoint: err.config?.url
    });
  }
  const { message, code } = parseDativeErrorResponse(err.response);
  return Promise.reject({
    message: message,
    statusCode: code
  });
}

export const http: AxiosInstance = axios.create({
  baseURL: dativeUrl,
  timeout: 120000, // 2 minutes for SQL operations
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  }
});

http.interceptors.request.use(requestStart, (err) => Promise.reject(err));

http.interceptors.response.use(responseSuccess, responseError);
