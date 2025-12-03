import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { PassThrough } from 'stream';

export const gridFsStream2Buffer = (stream: NodeJS.ReadableStream) => {
  return new Promise<Buffer>((resolve, reject) => {
    if (!stream.readable) {
      return resolve(Buffer.from([]));
    }

    const chunks: Uint8Array[] = [];

    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });
    stream.on('end', () => {
      const resultBuffer = Buffer.concat(chunks); // One-time splicing
      resolve(resultBuffer);
    });
    stream.on('error', (err) => {
      reject(err);
    });
  });
};

export const stream2Encoding = async (stream: NodeJS.ReadableStream) => {
  const copyStream = stream.pipe(new PassThrough());

  /* get encoding */
  const buffer = await (() => {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      stream.on('data', (chunk) => {
        if (totalLength < 200) {
          chunks.push(chunk);
          totalLength += chunk.length;

          if (totalLength >= 200) {
            resolve(Buffer.concat(chunks));
          }
        }
      });
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      stream.on('error', (err) => {
        reject(err);
      });
    });
  })();

  const enc = detectFileEncoding(buffer);

  return {
    encoding: enc,
    stream: copyStream
  };
};

// 单块大小：尽可能大，但不超过 14MB，不小于512KB
export const computeGridFsChunSize = (fileSize: number) => {
  // 计算理想块大小：文件大小 ÷ 目标块数(10)。 并且每个块需要小于 14MB
  const idealChunkSize = Math.min(Math.ceil(fileSize / 10), 14 * 1024 * 1024);

  // 确保块大小至少为512KB
  const minChunkSize = 512 * 1024; // 512KB

  // 取理想块大小和最小块大小中的较大值
  let chunkSize = Math.max(idealChunkSize, minChunkSize);

  // 将块大小向上取整到最接近的64KB的倍数，使其更整齐
  chunkSize = Math.ceil(chunkSize / (64 * 1024)) * (64 * 1024);

  return chunkSize;
};
