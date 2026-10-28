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

/**
 * 可直接展示给用户的预期业务错误。
 * type 仅补充错误分类；配置错误用于日志降噪，未指定时沿用普通业务错误的处理。
 * 保留既有 message/displayMessage 参数，并通过 options 同时接收分类和原始 cause。
 */
export class UserError extends Error {
  readonly type?: 'config';

  constructor(
    message: string,
    readonly displayMessage?: string,
    options?: ErrorOptions & { type?: UserError['type'] }
  ) {
    super(message, options);
    this.name = 'UserError';
    this.type = options?.type;
  }
}

/**
 * 识别 UserError 的配置错误分类，兼容跨构建产物和工作流序列化后的普通对象。
 * 必须同时保留用户错误身份和 config 分类，避免把普通业务错误或系统异常一并降级。
 */
export const isUserConfigError = (
  error: unknown
): error is
  | (UserError & { type: 'config' })
  | { name: 'UserError'; type: 'config'; displayMessage?: string } =>
  typeof error === 'object' &&
  error !== null &&
  'type' in error &&
  error.type === 'config' &&
  (error instanceof UserError || ('name' in error && error.name === 'UserError'));

/**
 * 表示错误提示已经由业务侧自行展示，通用请求层应跳过重复 toast。
 */
export class ToastHandledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToastHandledError';
  }
}
