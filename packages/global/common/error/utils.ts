import { replaceSensitiveText } from '../string/tools';

// 错误消息映射表
const ERROR_MESSAGE_MAP: Record<string, string> = {
  'Connection error.': 'error.connection_error',
  'Connection error': 'error.connection_error'
};

/**
 * 获取错误消息的国际化键
 * @param errorMessage 原始错误消息
 * @returns 国际化键或原始消息
 */
export const getErrorMessageKey = (errorMessage: string): string => {
  if (!errorMessage) return '';

  // 尝试直接匹配
  if (ERROR_MESSAGE_MAP[errorMessage]) {
    return ERROR_MESSAGE_MAP[errorMessage];
  }

  // 尝试忽略大小写匹配
  const lowerErrorMessage = errorMessage.toLowerCase();
  for (const [key, value] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (key.toLowerCase() === lowerErrorMessage) {
      return value;
    }
  }

  // 尝试部分匹配（包含关系）
  for (const [key, value] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (
      lowerErrorMessage.includes(key.toLowerCase()) ||
      key.toLowerCase().includes(lowerErrorMessage)
    ) {
      return value;
    }
  }

  // 如果没有找到匹配，返回原始消息
  return errorMessage;
};

export const getErrText = (err: any, def = ''): any => {
  const msg: string =
    typeof err === 'string'
      ? err
      : err?.response?.data?.message ||
        err?.response?.message ||
        err?.message ||
        err?.response?.data?.msg ||
        err?.response?.msg ||
        err?.msg ||
        err?.error ||
        def;

  // 获取错误消息键
  const errorKey = getErrorMessageKey(msg);

  // msg && console.log('error =>', msg);
  return replaceSensitiveText(errorKey);
};
