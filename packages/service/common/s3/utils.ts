import jwt from 'jsonwebtoken';
import { isAfter, differenceInSeconds } from 'date-fns';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import type { ClientSession } from 'mongoose';
import { MongoS3TTL } from './schema';
import { S3Buckets } from './constants';
import { S3PrivateBucket } from './buckets/private';
import { S3Sources, type UploadImage2S3BucketParams } from './type';
import { S3PublicBucket } from './buckets/public';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ParsedFileContentS3KeyParams } from './sources/dataset/type';
import { EndpointUrl } from '@fastgpt/global/common/file/constants';

/**
 *
 * @param objectKey
 * @param expiredTime
 * @returns
 */
export function jwtSignS3ObjectKey(objectKey: string, expiredTime: Date) {
  const secret = process.env.FILE_TOKEN_KEY as string;
  const expiresIn = differenceInSeconds(expiredTime, new Date());
  const token = jwt.sign({ objectKey }, secret, { expiresIn });

  return `${EndpointUrl}/api/system/file/${token}`;
}

export function jwtVerifyS3ObjectKey(token: string) {
  const secret = process.env.FILE_TOKEN_KEY as string;
  return new Promise<{ objectKey: string }>((resolve, reject) => {
    jwt.verify(token, secret, (err, payload) => {
      if (err || !payload || !(payload as jwt.JwtPayload).objectKey) {
        reject(ERROR_ENUM.unAuthFile);
      }

      resolve(payload as { objectKey: string });
    });
  });
}

export function removeS3TTL({
  key,
  bucketName,
  session
}: {
  key: string[] | string;
  bucketName: keyof typeof S3Buckets;
  session?: ClientSession;
}) {
  if (!key) return;

  if (Array.isArray(key)) {
    return MongoS3TTL.deleteMany(
      {
        minioKey: { $in: key },
        bucketName: S3Buckets[bucketName]
      },
      { session }
    );
  }

  if (typeof key === 'string') {
    return MongoS3TTL.deleteOne(
      {
        minioKey: key,
        bucketName: S3Buckets[bucketName]
      },
      { session }
    );
  }
}

export async function uploadImage2S3Bucket(
  bucketName: keyof typeof S3Buckets,
  params: UploadImage2S3BucketParams
) {
  const { base64Img, filename, mimetype, uploadKey, expiredTime } = params;

  const bucket = bucketName === 'private' ? new S3PrivateBucket() : new S3PublicBucket();

  const base64Data = base64Img.split(',')[1] || base64Img;
  const buffer = Buffer.from(base64Data, 'base64');

  await bucket.putObject(uploadKey, buffer, buffer.length, {
    'content-type': mimetype,
    'upload-time': new Date().toISOString(),
    'origin-filename': encodeURIComponent(filename)
  });

  const now = new Date();
  if (expiredTime && isAfter(expiredTime, now)) {
    await MongoS3TTL.create({
      minioKey: uploadKey,
      bucketName: bucket.name,
      expiredTime: expiredTime
    });
  }

  return uploadKey;
}

export const getFileNameFromPresignedURL = (presignedURL: string) => {
  const url = new URL(presignedURL);
  const fullname = url.pathname.split('/').pop()!;
  const extension = path.extname(fullname);
  const filename = decodeURIComponent(path.basename(fullname, extension));
  return {
    filename,
    extension: extension.replace('.', '')
  };
};

export const ParsedFileContentS3Key = {
  // 临时的文件路径（比如 evaluation)
  temp: ({ teamId, appId }: { teamId: string; appId: string }) => {
    return `${S3Sources.temp}/${teamId}/${appId}/temp/${randomUUID()}`;
  },

  // 对话中上传的文件的解析结果的图片的 Key
  chat: ({ appId, chatId, uId }: { chatId: string; uId: string; appId: string }) => {
    return `${S3Sources.chat}/${appId}/${uId}/${chatId}`;
  },

  // 上传数据集的文件的解析结果的图片的 Key
  dataset: (params: ParsedFileContentS3KeyParams) => {
    const { datasetId, mimetype: ext, filename, parsedFileKey } = params;

    const imageName = (() => {
      const id = getNanoid(6);
      if (!filename) return `${id}.${ext}`;
      return !!path.extname(filename) ? `${id}-${filename}` : `${id}-${filename}.${ext}`;
    })();

    if (!parsedFileKey) {
      return {
        key: [S3Sources.dataset, datasetId, imageName].join('/'),
        filename: imageName
      };
    }

    const parsedFileName = parsedFileKey.split('/').at(-1)!;
    const parsedContentPrefix = `parsed-${path.basename(parsedFileName, path.extname(parsedFileName))}`;
    const parsedContentKey = parsedFileKey
      .split('/')
      .slice(0, -1)
      .concat(parsedContentPrefix)
      .join('/');

    return {
      key: parsedContentKey,
      filename: imageName
    };
  }
};
