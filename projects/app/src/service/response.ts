import { sseResponseEventEnum } from '@/constants/chat';
import { NextApiResponse } from 'next';
import {
  openaiError,
  openaiAccountError,
  proxyError,
  ERROR_RESPONSE,
  ERROR_ENUM
} from './errorCode';
import { clearCookie, sseResponse, addLog } from './utils/tools';

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
  let msg = '';
  if ((code < 200 || code >= 400) && !message) {
    msg = error?.response?.statusText || error?.message || '请求错误';
    if (typeof error === 'string') {
      msg = error;
    } else if (proxyError[error?.code]) {
      msg = '网络连接异常';
    } else if (error?.response?.data?.error?.message) {
      msg = error?.response?.data?.error?.message;
    } else if (openaiAccountError[error?.response?.data?.error?.code]) {
      msg = openaiAccountError[error?.response?.data?.error?.code];
    } else if (openaiError[error?.response?.statusText]) {
      msg = openaiError[error.response.statusText];
    }

    addLog.error(`response error: ${msg}`, error);
  }

  res.status(code).json({
    code,
    statusText: '',
    message: message || msg,
    data: data !== undefined ? data : null
  });
};

export const sseErrRes = (res: NextApiResponse, error: any) => {
  const errResponseKey = typeof error === 'string' ? error : error?.message;

  // Specified error
  if (ERROR_RESPONSE[errResponseKey]) {
    // login is expired
    if (errResponseKey === ERROR_ENUM.unAuthorization) {
      clearCookie(res);
    }

    return sseResponse({
      res,
      event: sseResponseEventEnum.error,
      data: JSON.stringify(ERROR_RESPONSE[errResponseKey])
    });
  }

  let msg = error?.response?.statusText || error?.message || '请求错误';
  if (typeof error === 'string') {
    msg = error;
  } else if (proxyError[error?.code]) {
    msg = '网络连接异常';
  } else if (error?.response?.data?.error?.message) {
    msg = error?.response?.data?.error?.message;
  } else if (openaiAccountError[error?.response?.data?.error?.code]) {
    msg = openaiAccountError[error?.response?.data?.error?.code];
  } else if (openaiError[error?.response?.statusText]) {
    msg = openaiError[error.response.statusText];
  }

  addLog.error(`sse error: ${msg}`, error);

  sseResponse({
    res,
    event: sseResponseEventEnum.error,
    data: JSON.stringify({ message: msg })
  });
};
