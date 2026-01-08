import type { NextApiResponse } from 'next';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { proxyError, ERROR_RESPONSE, ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { addLog } from '../system/log';
import { replaceSensitiveText } from '@fastgpt/global/common/string/tools';
import { UserError } from '@fastgpt/global/common/error/utils';
import { clearCookie } from '../../support/permission/auth/common';
import { ZodError } from 'zod';

export interface ResponseType<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface ProcessedError {
  code: number;
  statusText: string;
  message: string;
  shouldClearCookie: boolean;
  data?: any;
  zodError?: any;
}

/**
 * 通用错误处理函数，提取错误信息并分类记录日志
 * @param params - 包含错误对象、URL和默认状态码的参数
 * @returns 处理后的错误对象
 */
export function processError(params: {
  error: any;
  url?: string;
  defaultCode?: number;
}): ProcessedError {
  const { error, url, defaultCode = 500 } = params;
  let zodError;

  const errResponseKey = typeof error === 'string' ? error : error?.message;

  // 1. 处理特定的业务错误（ERROR_RESPONSE）
  if (ERROR_RESPONSE[errResponseKey]) {
    const shouldClearCookie = errResponseKey === ERROR_ENUM.unAuthorization;

    // 记录业务侧错误日志
    addLog.info(`Api response error: ${url}`, ERROR_RESPONSE[errResponseKey]);

    return {
      code: ERROR_RESPONSE[errResponseKey].code || defaultCode,
      statusText: ERROR_RESPONSE[errResponseKey].statusText || 'error',
      message: ERROR_RESPONSE[errResponseKey].message,
      data: ERROR_RESPONSE[errResponseKey].data,
      shouldClearCookie
    };
  }

  // 2. 提取通用错误消息
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

  // 3. 根据错误类型记录不同级别的日志
  if (error instanceof UserError) {
    addLog.info(`Request error: ${url}, ${msg}`);
  } else if (error instanceof ZodError) {
    zodError = (() => {
      try {
        return JSON.parse(error.message);
      } catch (error) {}
    })();
    addLog.error(`[Zod] Error in ${url}`, {
      data: zodError
    });
    msg = error.message;
  } else {
    addLog.error(`System unexpected error: ${url}, ${msg}`, error);
  }

  // 4. 返回处理后的错误信息
  return {
    code: defaultCode,
    statusText: 'error',
    message: replaceSensitiveText(msg),
    shouldClearCookie: false,
    zodError
  };
}

export const jsonRes = <T = any>(
  res: NextApiResponse,
  props?: {
    code?: number;
    message?: string;
    data?: T;
    error?: any;
    url?: string;
  }
) => {
  const { code = 200, message = '', data = null, error, url } = props || {};

  // 如果有错误，使用统一的错误处理逻辑
  if (error) {
    const processedError = processError({ error, url, defaultCode: code });

    // 如果需要清除 cookie
    if (processedError.shouldClearCookie) {
      clearCookie(res);
    }

    res.status(500).json({
      code: processedError.code,
      statusText: processedError.statusText,
      message: message || processedError.message,
      data: processedError.data !== undefined ? processedError.data : null,
      zodError: processedError.zodError
    });

    return;
  }

  // 成功响应
  res.status(code).json({
    code,
    statusText: '',
    message: replaceSensitiveText(message),
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
      event: SseResponseEventEnum.error,
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
    msg = `${error?.error?.code} ${error?.error?.message}`;
  }

  addLog.error(`sse error: ${msg}`, error);

  responseWrite({
    res,
    event: SseResponseEventEnum.error,
    data: JSON.stringify({ message: replaceSensitiveText(msg) })
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

export const responseWriteNodeStatus = ({
  res,
  status = 'running',
  name
}: {
  res?: NextApiResponse;
  status?: 'running';
  name: string;
}) => {
  responseWrite({
    res,
    event: SseResponseEventEnum.flowNodeStatus,
    data: JSON.stringify({
      status,
      name
    })
  });
};
