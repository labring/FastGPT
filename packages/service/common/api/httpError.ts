import { getErrText } from '@fastgpt/global/common/error/utils';

/**
 * 将 HTTP 请求异常整理成可序列化、可展示的错误摘要。
 *
 * Axios 等请求库的原始错误通常包含循环引用和大量配置对象，这里只保留排查请求失败所需的
 * method、status、code 和响应数据。rawText 合并已脱敏的错误摘要与响应体片段，
 * 供节点展示和错误输出复用；data 保留原始值，供调用方单独保存完整错误。
 */
export const formatHttpError = (error: any) => {
  const message = getErrText(error);
  const data = error?.response?.data;

  /** 响应体只用于补充错误摘要；重复、空白或无法序列化时保留原摘要。 */
  const getErrorData = (): string => {
    if (data == null) return '';

    try {
      const text = (() => {
        if (typeof data === 'string') return data;
        // 仅含 message/msg 的响应已由 getErrText 提取，避免再追加一份同义 JSON。
        if (
          typeof data === 'object' &&
          Object.keys(data).length === 1 &&
          ('message' in data || 'msg' in data)
        ) {
          return getErrText(data);
        }
        return JSON.stringify(data) ?? '';
      })();
      const dataText = getErrText(text);
      if (!dataText.trim() || message.includes(dataText)) return '';

      const maxLength = 2000;
      return dataText.length > maxLength ? `${dataText.slice(0, maxLength)}...` : dataText;
    } catch {
      return '';
    }
  };

  return {
    message,
    data,
    rawText: getErrText([message, getErrorData()].filter(Boolean).join('\n')),
    name: error?.name,
    method: error?.config?.method,
    code: error?.code,
    status: error?.status
  };
};

/**
 * 提取不可信 HTTP 异常中可记录的 code/status，不复制原对象或调用序列化。
 * 调用方明确选择状态来源；只有响应状态缺省时才允许回退，非法响应状态不能被直接状态覆盖。
 * 属性不可读时返回空诊断，避免日志处理替换原业务异常。
 */
export const getSafeHttpErrorFields = ({
  error,
  statusSource
}: {
  error: unknown;
  statusSource: 'response' | 'responseOrDirect';
}) => {
  try {
    const details = typeof error === 'object' && error !== null ? error : undefined;
    const code = details && 'code' in details ? details.code : undefined;
    const response = details && 'response' in details ? details.response : undefined;
    const responseStatus =
      typeof response === 'object' && response !== null && 'status' in response
        ? response.status
        : undefined;
    const status =
      statusSource === 'responseOrDirect'
        ? (responseStatus ?? (details && 'status' in details ? details.status : undefined))
        : responseStatus;
    const safeCodes = [
      'ECONNABORTED',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ERR_NETWORK',
      'ERR_BAD_REQUEST',
      'ERR_BAD_RESPONSE',
      'ERR_CANCELED'
    ];
    return {
      ...(typeof code === 'string' && safeCodes.includes(code) ? { code } : {}),
      ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
        ? { status }
        : {})
    };
  } catch {
    return {};
  }
};

/** API 与数据源使用固定日志标签，并保留原有的直接状态回退，不改变业务响应。 */
export const getSafeHttpErrorLog = (error: unknown) => ({
  name: 'HttpRequestError',
  message: 'HTTP request failed',
  ...getSafeHttpErrorFields({ error, statusSource: 'responseOrDirect' })
});
