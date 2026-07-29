import { Readable } from 'node:stream';

type CreateSizeLimitedStreamParams = {
  stream: Readable;
  maxBytes: number;
  createExceededError: (bytesRead: number) => Error;
};

/**
 * 为 Node Readable 增加实际读取字节上限，避免缺失或伪造 Content-Length 绕过限制。
 */
export function createSizeLimitedStream({
  stream,
  maxBytes,
  createExceededError
}: CreateSizeLimitedStreamParams): Readable {
  return Readable.from(
    (async function* () {
      let bytesRead = 0;

      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytesRead += buffer.length;
        if (bytesRead > maxBytes) {
          throw createExceededError(bytesRead);
        }
        yield buffer;
      }
    })()
  );
}
