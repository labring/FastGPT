import { getLogger, infra } from '@fastgpt/service/common/logger';
import { type Method } from 'axios';
import { createProxyAxios } from '@fastgpt/service/common/api/axios';

const url = process.env.API_PROXY_URL;
const token = process.env.API_PROXY_TOKEN;
const logger = getLogger(infra.aiProxy);

if (!url) {
  logger.warn('[AIProxy] API_PROXY_URL is empty');
}
if (!token) {
  logger.warn('[AIProxy] API_PROXY_TOKEN is empty');
}

const instance = createProxyAxios({
  baseURL: url,
  timeout: 60000, // 超时时间
  headers: {
    Authorization: `Bearer ${token}`
  }
});

/**
 * 响应数据检查
 */
const checkRes = (data: any) => {
  if (data === undefined) {
    logger.warn('[AIProxy] response data is empty');
    return Promise.reject('服务器异常');
  }
  return data.data;
};
const responseError = (err: any) => {
  const errorMessage =
    typeof err?.message === 'string'
      ? err.message
      : typeof err === 'string'
        ? err
        : 'unknown error';

  logger.error('[AIProxy] request failed', {
    message: errorMessage,
    code: err?.code,
    status: err?.response?.status,
    url: err?.config?.url,
    method: err?.config?.method
  });

  if (!err) {
    return Promise.reject({ message: '未知错误' });
  }
  if (typeof err === 'string') {
    return Promise.reject({ message: err });
  }
  if (typeof err.message === 'string') {
    return Promise.reject({ message: err.message });
  }
  if (typeof err.data === 'string') {
    return Promise.reject({ message: err.data });
  }
  if (err?.response?.data) {
    return Promise.reject(err?.response?.data);
  }
  return Promise.reject(err);
};

const request = <T>(url: string, data: any, method: Method): Promise<T> => {
  /* 去空 */
  for (const key in data) {
    if (data[key] === undefined) {
      delete data[key];
    }
  }

  return instance
    .request({
      url,
      method,
      data: ['POST', 'PUT'].includes(method) ? data : undefined,
      params: !['POST', 'PUT'].includes(method) ? data : undefined
    })
    .then((res) => checkRes(res.data))
    .catch((err) => responseError(err));
};

// TODO: channel crud
export const ApiProxy = {};
