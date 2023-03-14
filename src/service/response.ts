import { NextApiResponse } from 'next';
import { openaiError, proxyError } from './errorCode';

export interface ResponseType<T = any> {
  code: number;
  message: string;
  data: T;
}

export const jsonRes = (
  res: NextApiResponse,
  props?: {
    code?: number;
    message?: string;
    data?: any;
    error?: any;
  }
) => {
  const { code = 200, message = '', data = null, error } = props || {};

  let msg = message;
  if ((code < 200 || code >= 400) && !message) {
    msg = error?.message || '请求错误';
    if (typeof error === 'string') {
      msg = error;
    } else if (proxyError[error?.code]) {
      msg = '服务器代理出错';
    } else if (openaiError[error?.response?.statusText]) {
      msg = openaiError[error.response.statusText];
    }

    console.log('error->', error.code, error?.response?.statusText, msg);
  }

  res.json({
    code,
    message: msg,
    data
  });
};
