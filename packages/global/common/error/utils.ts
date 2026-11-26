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
 * message/displayMessage 分别保留业务原因和展示文案，options 可携带原始 cause。
 */
export class UserError extends Error {
  constructor(
    message: string,
    readonly displayMessage?: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'UserError';
  }
}

/**
 * 预期的用户配置错误；构造参数与 UserError 保持一致，供日志和工作流统一降级。
 */
export class UserConfigError extends UserError {
  constructor(message: string, displayMessage?: string, options?: ErrorOptions) {
    super(message, displayMessage, options);
    this.name = 'UserConfigError';
  }
}

/**
 * 按类身份识别配置错误，兼容跨构建产物和序列化后仅保留 name 的错误记录。
 * 不沿 cause 分类，普通 UserError 和包含配置错误的系统异常仍保留原有语义。
 */
export const isUserConfigError = (
  error: unknown
): error is UserConfigError | { name: 'UserConfigError'; displayMessage?: string } =>
  error instanceof UserConfigError ||
  (typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'UserConfigError');

// 同一进程中的不同构建模块必须共享错误身份，同时防止普通对象伪造 name 改变响应状态。
const serverConfigErrorBrand = Symbol.for('fastgpt.ServerConfigError');

/**
 * 服务端实例级配置缺失或不可用错误（例如实例默认模型被停用或类型不匹配）；
 * 继承 UserError 以保留稳定业务码、展示文案与 isModelConfigError 兼容，
 * 并在响应层映射为 HTTP 500 以保留 5xx 链路告警。
 */
export class ServerConfigError extends UserError {
  readonly [serverConfigErrorBrand] = true;

  constructor(message: string, displayMessage?: string, options?: ErrorOptions) {
    super(message, displayMessage, options);
    this.name = 'ServerConfigError';
  }
}

/**
 * 跨模块识别服务端实例级配置错误；普通对象仅含同名字段不会被信任。
 */
export const isServerConfigError = (error: unknown): error is ServerConfigError =>
  error instanceof ServerConfigError ||
  (typeof error === 'object' &&
    error !== null &&
    serverConfigErrorBrand in error &&
    (error as Record<symbol, unknown>)[serverConfigErrorBrand] === true);

/**
 * 表示错误提示已经由业务侧自行展示，通用请求层应跳过重复 toast。
 */
export class ToastHandledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToastHandledError';
  }
}
