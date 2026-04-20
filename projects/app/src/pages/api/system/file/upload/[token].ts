import type { NextApiRequest } from 'next';
import { Transform } from 'node:stream';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
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

type ValidatedUploadFile = Awaited<ReturnType<typeof validateUploadFile>>;

const parseContentLength = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const createUploadGuardStream = ({ maxSize, uploadConstraints, filename }: GuardStreamOptions) => {
  const inspectBytes = getUploadInspectBytes(filename);
  let uploadedBytes = 0;
  let bufferedBytes = 0;
  const chunks: Buffer[] = [];
  let validatedFile: ValidatedUploadFile | undefined;
  let validationSettled = false;
  let resolveValidatedUpload!: (value: ValidatedUploadFile) => void;
  let rejectValidatedUpload!: (reason?: unknown) => void;

  const validatedUpload = new Promise<ValidatedUploadFile>((resolve, reject) => {
    resolveValidatedUpload = resolve;
    rejectValidatedUpload = reject;
  });

  const settleValidation = ({
    result,
    error
  }: {
    result?: ValidatedUploadFile;
    error?: unknown;
  }) => {
    if (validationSettled) return;
    validationSettled = true;

    if (error) {
      rejectValidatedUpload(error);
      return;
    }
    if (result) {
      resolveValidatedUpload(result);
    }
  };

  const validateBuffer = async () => {
    if (validatedFile) return validatedFile;
    const buffer = Buffer.concat(chunks, bufferedBytes);

    const result = await validateUploadFile({
      buffer,
      filename,
      uploadConstraints
    });

    validatedFile = result;
    settleValidation({ result });

    return result;
  };

  const stream = new Transform({
    transform(chunk, _, callback) {
      uploadedBytes += chunk.length;
      if (uploadedBytes > maxSize) {
        const error = new Error('EntityTooLarge');
        settleValidation({ error });
        callback(error);
        return;
      }

      if (validatedFile) {
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
        .catch((error) => {
          settleValidation({ error });
          callback(error);
        });
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
        .catch((error) => {
          settleValidation({ error });
          callback(error);
        });
    }
  });

  stream.once('error', (error) => {
    settleValidation({ error });
  });
  stream.once('close', () => {
    if (!validationSettled && !validatedFile) {
      settleValidation({ error: new Error('UploadStreamClosed') });
    }
  });

  return {
    stream,
    validatedUpload
  };
};

const buildUploadMetadata = ({
  metadata,
  filename
}: {
  metadata?: Record<string, string>;
  filename?: string;
}) => {
  if (!filename) return metadata;

  return {
    ...metadata,
    contentDisposition: getContentDisposition({
      filename,
      type: 'attachment'
    }),
    originFilename: encodeURIComponent(filename)
  };
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
  const { stream: guardStream, validatedUpload } = createUploadGuardStream({
    maxSize,
    uploadConstraints,
    filename
  });

  req.pipe(guardStream);
  const validatedFile = await validatedUpload;

  await bucket.client.uploadObject({
    key: objectKey,
    body: guardStream,
    contentType: validatedFile.contentType,
    contentLength,
    metadata: buildUploadMetadata({
      metadata,
      filename: validatedFile.filename
    })
  });

  return { success: true };
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
