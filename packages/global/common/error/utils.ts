import { replaceSensitiveText } from '../string/tools';
import { ERROR_RESPONSE } from './errorCode';
import type { localeType } from '../i18n/type';
import { parseI18nString } from '../i18n/utils';

/**
 * 提取上游错误中的非空文本，响应体的具体原因优先于 HTTP 通用文案。
 * 只读取 message/msg/errmsg 等协议字段，不信任 displayMessage 或转换整个对象；
 * 脱敏、业务码映射和多语言显示由调用方处理。
 */
export const getErrorMessage = (error: unknown, fallback = ''): string => {
  const recordOf = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const original = recordOf(error);
  const response = recordOf(original.response);
  const body = recordOf(response.data);
  const bodyError = recordOf(body.error);
  const nestedError = recordOf(original.error);

  const candidates = [
    typeof error === 'string' ? error : undefined,
    bodyError.message,
    bodyError.msg,
    body.message,
    body.msg,
    body.errmsg,
    typeof body.error === 'string' ? body.error : undefined,
    typeof response.data === 'string' ? response.data : undefined,
    nestedError.message,
    nestedError.msg,
    original.message,
    original.msg,
    original.errmsg,
    typeof original.error === 'string' ? original.error : undefined,
    typeof original.data === 'string' ? original.data : undefined,
    response.statusText
  ];
  return (
    candidates.find((value): value is string => typeof value === 'string' && !!value.trim()) ??
    fallback
  );
};

export const getErrText = (err: any, def = '', lang?: localeType): any => {
  const parseI18nError = (value: any): string | undefined => {
    if (!lang || !value || typeof value !== 'object') return;

    if (typeof value.en === 'string') {
      return parseI18nString(value, lang);
    }
  };

  const getRawMsg = (e: any): any => {
    if (typeof e === 'string') return e;
    if (!e) return '';
    return (
      e.system_error_text ||
      e.errorText ||
      (typeof e.displayMessage === 'string' ? e.displayMessage : undefined) ||
      parseI18nError(e.response?.data?.error?.reason) ||
      parseI18nError(e.response?.error?.reason) ||
      parseI18nError(e.error?.reason) ||
      parseI18nError(e.response?.data?.reason) ||
      parseI18nError(e.response?.reason) ||
      parseI18nError(e.reason) ||
      e.response?.data?.message ||
      e.response?.message ||
      e.response?.data?.msg ||
      e.response?.msg ||
      e.message ||
      e.msg ||
      (typeof e.error === 'string' ? e.error : getRawMsg(e.error)) ||
      e.code ||
      ''
    );
  };

  const msg = getRawMsg(err) || def;

  if (ERROR_RESPONSE[msg]) {
    return ERROR_RESPONSE[msg].message;
  }

  // Axios special
  if (err?.errors && Array.isArray(err.errors) && err.errors.length > 0) {
    return err.errors[0].message;
  }

  // msg && console.log('error =>', msg);
  return replaceSensitiveText(msg);
};

export const getErrResponse = (err: any): any => {
  return err?.response?.data || err?.response || err;
};

export class UserError extends Error {
  constructor(
    message: string,
    readonly displayMessage?: string
  ) {
    super(message);
    this.name = 'UserError';
  }
}

/**
 * 用户配置导致的预期内错误。
 *
 * 这类错误应直接返回给调用方，不进入系统错误日志或 OTel error 指标，
 * 避免第三方 key、MCP 地址等用户配置问题污染系统可用性观测。
 */
export class UserConfigError extends UserError {
  constructor(message: string, displayMessage?: string) {
    super(message, displayMessage);
    this.name = 'UserConfigError';
  }
}

/** 兼容错误跨构建产物或序列化后 instanceof 失效的情况。 */
export const isUserConfigError = (
  error: unknown
): error is UserConfigError | { name: 'UserConfigError'; displayMessage?: string } =>
  error instanceof UserConfigError ||
  (typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'UserConfigError');

/**
 * 表示错误提示已经由业务侧自行展示，通用请求层应跳过重复 toast。
 */
export class ToastHandledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToastHandledError';
  }
}
