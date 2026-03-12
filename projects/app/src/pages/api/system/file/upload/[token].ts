import type { NextApiRequest } from 'next';
import { Transform } from 'node:stream';
import { NextAPI } from '@/service/middleware/entry';
import { jwtVerifyS3UploadToken } from '@fastgpt/service/common/s3/security/token';
import type { UploadConstraints } from '@fastgpt/service/common/s3/contracts/type';
import {
  getUploadInspectBytes,
  validateUploadFile
} from '@fastgpt/service/common/s3/validation/upload';

type GuardStreamOptions = {
  maxSize: number;
  uploadConstraints: UploadConstraints;
  filename?: string;
};

const parseContentLength = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const createUploadGuardStream = ({ maxSize, uploadConstraints, filename }: GuardStreamOptions) => {
  const inspectBytes = getUploadInspectBytes();
  let uploadedBytes = 0;
  let validated = false;
  let bufferedBytes = 0;
  const chunks: Buffer[] = [];

  const validateBuffer = async () => {
    if (validated) return;
    const buffer = Buffer.concat(chunks, bufferedBytes);

    await validateUploadFile({
      buffer,
      filename,
      uploadConstraints
    });
    validated = true;
  };

  return new Transform({
    transform(chunk, _, callback) {
      uploadedBytes += chunk.length;
      if (uploadedBytes > maxSize) {
        callback(new Error('EntityTooLarge'));
        return;
      }

      if (validated) {
        callback(null, chunk);
        return;
      }

      chunks.push(chunk);
      bufferedBytes += chunk.length;

      if (bufferedBytes < inspectBytes) {
        callback();
        return;
      }

      validateBuffer()
        .then(() => {
          const initialBuffer = Buffer.concat(chunks, bufferedBytes);
          chunks.length = 0;
          bufferedBytes = 0;
          callback(null, initialBuffer);
        })
        .catch(callback);
    },
    flush(callback) {
      validateBuffer()
        .then(() => {
          if (bufferedBytes > 0) {
            callback(null, Buffer.concat(chunks, bufferedBytes));
            return;
          }
          callback();
        })
        .catch(callback);
    }
  });
};

async function handler(req: NextApiRequest) {
  if (req.method !== 'PUT') {
    return Promise.reject('Method not allowed');
  }

  const { token } = req.query as { token: string };
  const { objectKey, bucketName, maxSize, uploadConstraints, metadata } =
    await jwtVerifyS3UploadToken(token);

  const bucket = global.s3BucketMap[bucketName];
  if (!bucket) {
    return Promise.reject('S3 bucket not found');
  }

  const contentLength = parseContentLength(req.headers['content-length']);
  if (contentLength && contentLength > maxSize) {
    return Promise.reject('EntityTooLarge');
  }

  const filename = metadata?.originFilename;
  const guardStream = createUploadGuardStream({
    maxSize,
    uploadConstraints,
    filename
  });

  req.pipe(guardStream);

  await bucket.client.uploadObject({
    key: objectKey,
    body: guardStream,
    contentType: uploadConstraints.defaultContentType,
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
