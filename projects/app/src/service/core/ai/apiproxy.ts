import { addLog } from '@fastgpt/service/common/system/log';
import axios, { Method } from 'axios';

const url = process.env.API_PROXY_URL;
const token = process.env.API_PROXY_TOKEN;

const instance = axios.create({
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
    addLog.info('api proxy data is empty');
    return Promise.reject('服务器异常');
  }
  return data.data;
};
const responseError = (err: any) => {
  console.log('error->', '请求错误', err);

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
