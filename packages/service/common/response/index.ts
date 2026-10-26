import type { NodeApiResponse, NodeHttpResponse } from '../../types/http';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { proxyError, ERROR_RESPONSE, ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { replaceSensitiveText } from '@fastgpt/global/common/string/tools';
import { getErrorMessage, isUserConfigError, UserError } from '@fastgpt/global/common/error/utils';
import { clearCookie } from '../../support/permission/auth/common';
import { ZodError } from 'zod';
import type Stream from 'node:stream';
import { getLogger, LogCategories } from '../logger';
import { ApiRequestInputParseError, getZodError } from '../zod/requestParseError';
import { markProfileError } from '../profiling';

const logger = getLogger(LogCategories.HTTP.ERROR);

export interface ResponseType<T = any> {
  code: number;
  message: string;
  data: T;
  errorType?: string;
}

export interface ProcessedError {
  code: number;
  statusText: string;
  message: string;
  shouldClearCookie: boolean;
  httpStatus: number;
  data?: any;
  zodError?: any;
}

/**
 * 业务 JSON `code` 与 HTTP 状态码解耦：多数业务码为 5xxxxx，不能当作 HTTP status。
 * 仅对明确语义映射到 4xx/5xx，其余默认 500。
 */
function resolveHttpStatusForApiError(
  processedError: ProcessedError,
  props: { code?: number; error: any }
): number {
  const { code: propsCode = 200, error } = props;
  const bc = processedError.code;

  if (typeof bc === 'number' && bc >= 400 && bc <= 499) {
    return bc;
  }

  if (
    typeof processedError.httpStatus === 'number' &&
    processedError.httpStatus >= 400 &&
    processedError.httpStatus <= 599
  ) {
    return processedError.httpStatus;
  }

  // packages/global/common/error/code/s3.ts：510000 段为上传校验类客户端错误
  if (typeof bc === 'number' && bc >= 510000 && bc < 511000) {
    return 400;
  }

  const raw = typeof error === 'string' ? error : error?.message;
  if (raw === 'EntityTooLarge') {
    return 413;
  }

  if (typeof propsCode === 'number' && propsCode >= 400 && propsCode <= 499) {
    return propsCode;
  }

  return 500;
}

function parseZodErrorMessage(error: ZodError | ApiRequestInputParseError) {
  const zodSourceError = getZodError(error);

  try {
    return JSON.parse(zodSourceError?.message || error.message);
  } catch {
    return undefined;
  }
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
    const message =
      error instanceof UserError && error.displayMessage
        ? replaceSensitiveText(error.displayMessage)
        : ERROR_RESPONSE[errResponseKey].message;

    // 记录业务侧错误日志
    logger.info('API response error', {
      url,
      code: ERROR_RESPONSE[errResponseKey].code,
      message,
      statusText: ERROR_RESPONSE[errResponseKey].statusText,
      data: ERROR_RESPONSE[errResponseKey].data
    });

    return {
      code: ERROR_RESPONSE[errResponseKey].code || defaultCode,
      statusText: ERROR_RESPONSE[errResponseKey].statusText || 'error',
      message,
      data: ERROR_RESPONSE[errResponseKey].data,
      httpStatus: ERROR_RESPONSE[errResponseKey].httpStatus ?? 500,
      shouldClearCookie
    };
  }

  // 2. 提取通用错误消息
  // 上游响应体的具体原因优先于 statusText；保留既有网络错误提示和业务码语义。
  let msg = getErrorMessage(error, '请求错误');
  if (typeof error !== 'string' && proxyError[error?.code]) {
    msg = '网络连接异常';
  }

  // 3. 根据错误类型记录不同级别的日志
  if (isUserConfigError(error)) {
    msg = error.displayMessage || msg;
  } else if (error instanceof UserError) {
    msg = error.displayMessage || msg;
    logger.info('Request error', { url, message: msg });
  } else if (error instanceof ZodError || error instanceof ApiRequestInputParseError) {
    zodError = parseZodErrorMessage(error);

    if (!(error instanceof ApiRequestInputParseError)) {
      logger.error('Zod validation error', { url, data: zodError, error });
    }

    msg = error.message;
  } else {
    logger.error('System unexpected error', { url, message: msg, error });
  }

  // 4. 返回处理后的错误信息
  return {
    code: defaultCode,
    statusText: 'error',
    message: replaceSensitiveText(msg),
    shouldClearCookie: false,
    httpStatus: defaultCode,
    zodError
  };
}

export const jsonRes = <T = any>(
  res: NodeApiResponse,
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

    const httpStatus = resolveHttpStatusForApiError(processedError, { code, error });

    res.status(httpStatus).json({
      code: processedError.code,
      statusText: processedError.statusText,
      message: message || processedError.message,
      data: processedError.data !== undefined ? processedError.data : null,
      zodError: processedError.zodError,
      errorType: error instanceof UserError ? 'UserError' : undefined
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

export const sseErrRes = (res: NodeHttpResponse, error: any) => {
  const { event, data, shouldClearCookie } = getSseErrorResponse(error);
  if (shouldClearCookie) {
    clearCookie(res);
  }
  responseWrite({
    res,
    event,
    data
  });
};

export const getSseErrorResponse = (
  error: any
): {
  event: SseResponseEventEnum.error;
  data: string;
  shouldClearCookie: boolean;
} => {
  // SSE 错误按协议以 HTTP 200 正常结束，共享入口只能按状态码/断流判断成败，
  // 因此在这个唯一的 SSE 错误载荷出口标记采集失败（v1、v2、pro 等入口共享）。
  // 只影响观测口径，不改变响应内容。
  markProfileError(error);

  const errResponseKey = typeof error === 'string' ? error : error?.message;
  const processedError = processError({ error });

  if (ERROR_RESPONSE[errResponseKey]) {
    return {
      event: SseResponseEventEnum.error,
      data: JSON.stringify({ ...ERROR_RESPONSE[errResponseKey], message: processedError.message }),
      shouldClearCookie: processedError.shouldClearCookie
    };
  }

  return {
    event: SseResponseEventEnum.error,
    data: JSON.stringify({ message: processedError.message }),
    shouldClearCookie: processedError.shouldClearCookie
  };
};

export function responseWriteController({
  res,
  readStream
}: {
  res: NodeHttpResponse;
  readStream: Stream.Readable;
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
  event,
  data
}: {
  res?: NodeHttpResponse;
  event?: string;
  data: string;
}) {
  const Write = res?.write;

  if (!Write) return;

  // 直接写出 error 事件（如 workflowSseEvent.error）同样意味着请求失败；
  // 与 getSseErrorResponse 的标记互为兜底，重复调用只保留第一个错误。
  if (event === SseResponseEventEnum.error) {
    markProfileError(data);
  }

  if (event) {
    Write(`event: ${event}\n`);
  }
  Write(`data: ${data}\n\n`);
}

export const responseWriteNodeStatus = ({
  res,
  status = 'running',
  name
}: {
  res?: NodeHttpResponse;
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
