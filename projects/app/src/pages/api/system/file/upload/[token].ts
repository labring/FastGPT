import type { NextApiRequest } from 'next';
import { Transform } from 'node:stream';
import { NextAPI } from '@/service/middleware/entry';
import { jwtVerifyS3UploadToken } from '@fastgpt/service/common/s3/token';
import { getContentTypeFromHeader } from '@fastgpt/service/common/file/utils';

const parseContentLength = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

async function handler(req: NextApiRequest) {
  if (req.method !== 'PUT') {
    return Promise.reject('Method not allowed');
  }

  const { token } = req.query as { token: string };
  const { objectKey, bucketName, maxSize, contentType, metadata } =
    await jwtVerifyS3UploadToken(token);

  const bucket = global.s3BucketMap[bucketName];
  if (!bucket) {
    return Promise.reject('S3 bucket not found');
  }

  const contentLength = parseContentLength(req.headers['content-length']);
  if (contentLength && contentLength > maxSize) {
    return Promise.reject('EntityTooLarge');
  }

  let uploadedBytes = 0;
  const sizeGuardStream = new Transform({
    transform(chunk, _, callback) {
      uploadedBytes += chunk.length;
      if (uploadedBytes > maxSize) {
        return callback(new Error('EntityTooLarge'));
      }
      callback(null, chunk);
    }
  });
  req.pipe(sizeGuardStream);
  const headerContentType = Array.isArray(req.headers['content-type'])
    ? req.headers['content-type'][0]
    : req.headers['content-type'];

  await bucket.client.uploadObject({
    key: objectKey,
    body: sizeGuardStream,
    contentType: getContentTypeFromHeader(headerContentType || '') || contentType,
    contentLength,
    metadata
  });

  return { success: true };
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
