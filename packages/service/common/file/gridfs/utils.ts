import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { PassThrough } from 'stream';

export const gridFsStream2Buffer = (stream: NodeJS.ReadableStream) => {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLength = 0;

    stream.on('data', (chunk) => {
      chunks.push(chunk);
      totalLength += chunk.length;
    });
    stream.on('end', () => {
      const resultBuffer = Buffer.concat(chunks, totalLength); // 一次性拼接
      resolve(resultBuffer);
    });
    stream.on('error', (err) => {
      reject(err);
    });
  });
};

export const stream2Encoding = async (stream: NodeJS.ReadableStream) => {
  const start = Date.now();
  const copyStream = stream.pipe(new PassThrough());

  /* get encoding */
  const buffer = await (() => {
    return new Promise<Buffer>((resolve, reject) => {
      let tmpBuffer: Buffer = Buffer.from([]);

      stream.on('data', (chunk) => {
        if (tmpBuffer.length < 200) {
          tmpBuffer = Buffer.concat([tmpBuffer, chunk]);

          if (tmpBuffer.length >= 200) {
            resolve(tmpBuffer);
          }
        }
      });
      stream.on('end', () => {
        resolve(tmpBuffer);
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
