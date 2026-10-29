/** API 边界预期内错误：由入口中间件映射为对应 HTTP 状态码，不再统一降级为 500。 */
export class ApiHttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiHttpError';
    this.statusCode = statusCode;
  }
}
