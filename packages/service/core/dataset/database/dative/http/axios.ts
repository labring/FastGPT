import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse
} from 'axios';
import { addLog } from '../../../../../common/system/log';

interface DativeErrorResponse {
  detail?: {
    msg?: string;
    error?: string;
    detail?: string;
  };
  message?: string;
  error?: string;
}

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

  // HTTP error with response
  const { response } = err;
  const endpoint = response.config?.url;

  addLog.error('Dative API error', {
    endpoint,
    status: response.status,
    statusText: response.statusText,
    data: response.data
  });

  const code = err?.response?.data?.statusCode;
  if (code >= 500) {
    return Promise.reject({
      message: `Dative server error: ${response.statusText || 'Internal Server Error'}`,
      statusCode: response.status,
      endpoint
    });
  }
  const errorData: DativeErrorResponse = response.data;
  let errorMessage: string;

  errorMessage = errorData.detail?.msg || 'Dative error';

  return Promise.reject({
    message: errorMessage,
    statusCode: response.status,
    endpoint,
    responseBody: errorData
  });
}

function getDativeBaseURL(): string {
  const dativeUrl = process.env.DATIVE_BASE_URL;
  if (!dativeUrl) {
    throw new Error('Dative service URL is not configured (DATIVE_BASE_URL)');
  }
  return dativeUrl;
}

export const http: AxiosInstance = axios.create({
  baseURL: getDativeBaseURL(),
  timeout: 300000, // 5 minutes for potentially long SQL operations
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  }
});

http.interceptors.request.use(requestStart, (err) => Promise.reject(err));

http.interceptors.response.use(responseSuccess, responseError);
