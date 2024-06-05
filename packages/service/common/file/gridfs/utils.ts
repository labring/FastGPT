export const gridFsStream2Buffer = (stream: NodeJS.ReadableStream) => {
  return new Promise<Buffer>((resolve, reject) => {
    let tmpBuffer: Buffer = Buffer.from([]);

    stream.on('data', (chunk) => {
      tmpBuffer = Buffer.concat([tmpBuffer, chunk]);
    });
    stream.on('end', () => {
      resolve(tmpBuffer);
    });
    stream.on('error', (err) => {
      reject(err);
    });
  });
};
