// 同一进程中的不同 Next.js 构建模块必须共享错误身份，不能依赖某一次加载产生的 class 引用。
const apiHttpErrorBrand = Symbol.for('fastgpt.ApiHttpError');

/** API 边界预期内错误：由入口中间件映射为对应 HTTP 状态码，不再统一降级为 500。 */
export class ApiHttpError extends Error {
  readonly [apiHttpErrorBrand] = true;
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiHttpError';
    this.statusCode = statusCode;
  }
}

/** 跨模块识别显式 HTTP 错误；普通业务对象即使包含同名字段也不改变响应状态。 */
export const isApiHttpError = (error: unknown): error is ApiHttpError =>
  error instanceof ApiHttpError ||
  (typeof error === 'object' &&
    error !== null &&
    apiHttpErrorBrand in error &&
    error[apiHttpErrorBrand] === true);
