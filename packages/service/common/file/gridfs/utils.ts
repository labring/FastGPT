import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { PassThrough } from 'stream';

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
