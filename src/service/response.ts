import { NextApiResponse } from 'next';
import { openaiError, openaiError2, proxyError } from './errorCode';

export interface ResponseType<T = any> {
  code: number;
  message: string;
  data: T;
}

export const jsonRes = <T = any>(
  res: NextApiResponse,
  props?: {
    code?: number;
    message?: string;
    data?: T;
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
    } else if (openaiError2[error?.response?.data?.error?.type]) {
      msg = openaiError2[error?.response?.data?.error?.type];
    } else if (openaiError[error?.response?.statusText]) {
      msg = openaiError[error.response.statusText];
    }
    console.log(`error-> msg:${msg}`);
    // request 时候报错
    if (error?.response) {
      console.log('statusText:', error?.response?.statusText);
      console.log('error data:', error?.response?.data);
    }
  }

  res.json({
    code,
    message: msg,
    data
  });
};
