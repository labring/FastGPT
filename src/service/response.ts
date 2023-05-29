import { NextApiResponse } from 'next';
import {
  openaiError,
  openaiAccountError,
  proxyError,
  ERROR_RESPONSE,
  ERROR_ENUM
} from './errorCode';
import { clearCookie } from './utils/tools';

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

  const errResponseKey = typeof error === 'string' ? error : error?.message;
  // Specified error
  if (ERROR_RESPONSE[errResponseKey]) {
    // login is expired
    if (errResponseKey === ERROR_ENUM.unAuthorization) {
      clearCookie(res);
    }

    return res.json(ERROR_RESPONSE[errResponseKey]);
  }

  // another error
  let msg = message || error?.message;
  if ((code < 200 || code >= 400) && !message) {
    msg = error?.message || '请求错误';
    if (typeof error === 'string') {
      msg = error;
    } else if (proxyError[error?.code]) {
      msg = '接口连接异常';
    } else if (error?.response?.data?.error?.message) {
      msg = error?.response?.data?.error?.message;
    } else if (openaiAccountError[error?.response?.data?.error?.code]) {
      msg = openaiAccountError[error?.response?.data?.error?.code];
    } else if (openaiError[error?.response?.statusText]) {
      msg = openaiError[error.response.statusText];
    }
    console.log(error);
  }

  res.json({
    code,
    statusText: '',
    message: msg,
    data: data !== undefined ? data : null
  });
};
