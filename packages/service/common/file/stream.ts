import { Readable, Transform } from 'node:stream';

type CreateSizeLimitedStreamParams = {
  stream: Readable | AsyncIterable<Uint8Array | Buffer | string>;
  maxBytes: number;
  createExceededError: (bytesRead: number) => Error;
};

/**
 * 为 Node Readable 增加实际读取字节上限，避免缺失或伪造 Content-Length 绕过限制。
 *
 * 立即接管源流错误并在包装流销毁时联动销毁源流，避免延迟消费窗口触发未捕获异常或泄漏底层连接。
 */
export function createSizeLimitedStream({
  stream,
  maxBytes,
  createExceededError
}: CreateSizeLimitedStreamParams): Readable {
  const source =
    typeof (stream as Partial<Readable>).pipe === 'function'
      ? (stream as Readable)
      : Readable.from(stream);
  let bytesRead = 0;

  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesRead += buffer.length;
      if (bytesRead > maxBytes) {
        const exceededError = createExceededError(bytesRead);
        if (!source.destroyed) {
          source.destroy(exceededError);
        }
        callback(exceededError);
        return;
      }
      callback(null, buffer);
    },
    destroy(error, callback) {
      if (!source.destroyed) {
        source.destroy(error ?? undefined);
      }
      callback(error);
    }
  });

  source.on('error', (error) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    if (!limiter.destroyed) {
      limiter.destroy(normalized);
    }
  });
  limiter.on('error', () => undefined);
  source.pipe(limiter);

  return limiter;
}
