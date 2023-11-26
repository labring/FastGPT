import type { NextApiResponse } from 'next';
import { sseResponseEventEnum } from './constant';
import { proxyError, ERROR_RESPONSE, ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { addLog } from '../mongo/controller';
import { clearCookie } from '../../support/permission/controller';

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
    } else if (error?.error?.message) {
      msg = error?.error?.message;
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

    return responseWrite({
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
  } else if (error?.error?.message) {
    msg = error?.error?.message;
  }

  addLog.error(`sse error: ${msg}`, error);

  responseWrite({
    res,
    event: sseResponseEventEnum.error,
    data: JSON.stringify({ message: msg })
  });
};

export function responseWriteController({
  res,
  readStream
}: {
  res: NextApiResponse;
  readStream: any;
}) {
  res.on('drain', () => {
    readStream?.resume?.();
  });

  return (text: string | Buffer) => {
    const writeResult = res.write(text);
    if (!writeResult) {
      readStream?.pause?.();
    }
  };
}

export function responseWrite({
  res,
  write,
  event,
  data
}: {
  res?: NextApiResponse;
  write?: (text: string) => void;
  event?: string;
  data: string;
}) {
  const Write = write || res?.write;

  if (!Write) return;

  event && Write(`event: ${event}\n`);
  Write(`data: ${data}\n\n`);
}
