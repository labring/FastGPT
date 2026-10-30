/** API 返回的 HTTP/业务错误。保留业务码与 requestId，便于调用方定位服务端日志。 */
export class FastGPTError extends Error {
  constructor(
    message: string,
    readonly details: {
      kind: 'api' | 'network' | 'protocol' | 'timeout' | 'aborted' | 'training';
      status?: number;
      code?: number;
      requestId?: string;
    },
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'FastGPTError';
  }
}
