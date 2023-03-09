import { NextApiResponse } from 'next';
import { openaiError } from './errorCode';

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
    } else if (error?.response?.data?.message in openaiError) {
      msg = openaiError[error?.response?.data?.message];
    }

    console.error(error);
    console.error(msg);
  }

  res.json({
    code,
    message: msg,
    data
  });
};
