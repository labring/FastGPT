import { addLog } from '../utils/log';

type ConfigType = {
  headers?: Record<string, string>;
  timeout?: number;
};

type ResponseDataType = {
  code: number;
  message: string;
  data: any;
};

/**
 * 响应数据检查
 */
function checkRes(data: ResponseDataType) {
  if (data === undefined) {
    console.log('error->', data, 'data is empty');
    return Promise.reject('服务器异常');
  } else if (data.code < 200 || data.code >= 400) {
    return Promise.reject(data);
  }
  return data.data;
}

/**
 * 响应错误处理
 */
function responseError(err: any) {
  addLog.error(`Fetch request error`, err);
  const data = err?.response?.data || err;

  if (!err) {
    return Promise.reject({ message: '未知错误' });
  }
  if (typeof err === 'string') {
    return Promise.reject({ message: err });
  }
  if (typeof data === 'string') {
    return Promise.reject({ message: data });
  }

  // Handle fetch-specific errors
  if (err.name === 'AbortError') {
    return Promise.reject({ message: '请求超时' });
  }
  if (err.name === 'TypeError' && err.message.includes('fetch')) {
    return Promise.reject({ message: '网络连接失败' });
  }

  return Promise.reject(data || err);
}

/**
 * 构建查询参数
 */
function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();

  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach((item) => searchParams.append(key, String(item)));
      } else {
        searchParams.append(key, String(value));
      }
    }
  });

  return searchParams.toString();
}

/**
 * 发送请求
 */
async function request(url: string, data: any, config: ConfigType, method: string): Promise<any> {
  // Remove undefined values
  const cleanData = { ...data };
  for (const key in cleanData) {
    if (cleanData[key] === undefined) {
      delete cleanData[key];
    }
  }

  const baseURL = `${process.env.FASTGPT_ENDPOINT}/api`;
  let fullUrl = `${baseURL}${url}`;

  // Default timeout from config or 600 seconds
  const timeout = config.timeout || 600000;

  const options: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      ...config.headers
    },
    signal: AbortSignal.timeout(timeout)
  };

  // Handle request body and query parameters
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    if (Object.keys(cleanData).length > 0) {
      options.body = JSON.stringify(cleanData);
    }
  } else if (Object.keys(cleanData).length > 0) {
    const queryString = buildQueryString(cleanData);
    if (queryString) {
      fullUrl += `?${queryString}`;
    }
  }

  try {
    const response = await fetch(fullUrl, options);

    // Handle non-2xx responses
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          code: response.status,
          message: response.statusText || `HTTP ${response.status}`,
          data: null
        };
      }
      throw errorData;
    }

    // Parse response
    let result;
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
    } else {
      // Handle non-JSON responses
      const text = await response.text();
      try {
        result = JSON.parse(text);
      } catch {
        // If it's not JSON, wrap it in the expected format
        result = {
          code: response.status,
          message: 'success',
          data: text
        };
      }
    }

    return checkRes(result);
  } catch (err) {
    return responseError(err);
  }
}

/**
 * GET 请求
 * @param {String} url - 请求路径
 * @param {Object} params - 查询参数
 * @param {Object} config - 请求配置
 * @returns {Promise<T>}
 */
export function GET<T = undefined>(url: string, params = {}, config: ConfigType = {}): Promise<T> {
  return request(url, params, config, 'GET');
}

/**
 * POST 请求
 * @param {String} url - 请求路径
 * @param {Object} data - 请求体数据
 * @param {Object} config - 请求配置
 * @returns {Promise<T>}
 */
export function POST<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'POST');
}

/**
 * PUT 请求
 * @param {String} url - 请求路径
 * @param {Object} data - 请求体数据
 * @param {Object} config - 请求配置
 * @returns {Promise<T>}
 */
export function PUT<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'PUT');
}

/**
 * DELETE 请求
 * @param {String} url - 请求路径
 * @param {Object} data - 请求体数据
 * @param {Object} config - 请求配置
 * @returns {Promise<T>}
 */
export function DELETE<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'DELETE');
}

/**
 * PATCH 请求
 * @param {String} url - 请求路径
 * @param {Object} data - 请求体数据
 * @param {Object} config - 请求配置
 * @returns {Promise<T>}
 */
export function PATCH<T = undefined>(url: string, data = {}, config: ConfigType = {}): Promise<T> {
  return request(url, data, config, 'PATCH');
}
