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
import type { ParsedFileContentS3KeyParams } from './sources/dataset/type';
import { EndpointUrl } from '@fastgpt/global/common/file/constants';

// S3文件名最大长度配置
export const S3_FILENAME_MAX_LENGTH = 50;

/**
 * 截断文件名，确保不超过最大长度，同时保留扩展名
 * @param filename 原始文件名
 * @param maxLength 最大长度限制
 * @returns 截断后的文件名
 */
export function truncateFilename(
  filename: string,
  maxLength: number = S3_FILENAME_MAX_LENGTH
): string {
  if (!filename) return filename;

  // 如果文件名长度已经符合要求，直接返回
  if (filename.length <= maxLength) {
    return filename;
  }

  const extension = path.extname(filename); // 包含点的扩展名，如 ".pdf"
  const nameWithoutExt = path.basename(filename, extension); // 不包含扩展名的文件名

  // 计算名称部分的最大长度（总长度减去扩展名长度）
  const maxNameLength = maxLength - extension.length;

  // 如果扩展名本身就很长导致没有空间放名称，则截断扩展名
  if (maxNameLength <= 0) {
    // 保留扩展名的开头部分，至少保留一个点
    const truncatedExt = extension.substring(0, Math.min(maxLength, extension.length));
    return truncatedExt;
  }

  // 截断文件名部分
  const truncatedName = nameWithoutExt.substring(0, maxNameLength);

  return truncatedName + extension;
}

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
      bucketName: bucket.bucketName,
      expiredTime: expiredTime
    });
  }

  return uploadKey;
}

const getFormatedFilename = (filename?: string) => {
  if (!filename) {
    return {
      formatedFilename: getNanoid(12),
      extension: ''
    };
  }

  const id = getNanoid(6);
  // 先截断文件名，再进行格式化
  const truncatedFilename = truncateFilename(filename);
  const extension = path.extname(truncatedFilename); // 带.
  const name = path.basename(truncatedFilename, extension);
  return {
    formatedFilename: `${id}-${name}`,
    extension: extension.replace('.', '')
  };
};

export const getFileS3Key = {
  // 临时的文件路径（比如 evaluation)
  temp: ({ teamId, filename }: { teamId: string; filename?: string }) => {
    const { formatedFilename, extension } = getFormatedFilename(filename);

    return {
      fileKey: [
        S3Sources.temp,
        teamId,
        `${formatedFilename}${extension ? `.${extension}` : ''}`
      ].join('/'),
      fileParsedPrefix: [S3Sources.temp, teamId, `${formatedFilename}-parsed`].join('/')
    };
  },

  avatar: ({ teamId, filename }: { teamId: string; filename?: string }) => {
    const { formatedFilename, extension } = getFormatedFilename(filename);
    return {
      fileKey: [
        S3Sources.avatar,
        teamId,
        `${formatedFilename}${extension ? `.${extension}` : ''}`
      ].join('/')
    };
  },

  // 对话中上传的文件的解析结果的图片的 Key
  chat: ({
    appId,
    chatId,
    uId,
    filename
  }: {
    chatId: string;
    uId: string;
    appId: string;
    filename: string;
  }) => {
    const { formatedFilename, extension } = getFormatedFilename(filename);
    const basePrefix = [S3Sources.chat, appId, uId, chatId].filter(Boolean).join('/');

    return {
      fileKey: [basePrefix, `${formatedFilename}${extension ? `.${extension}` : ''}`].join('/'),
      fileParsedPrefix: [basePrefix, `${formatedFilename}-parsed`].join('/')
    };
  },

  // 上传数据集的文件的解析结果的图片的 Key
  dataset: (params: ParsedFileContentS3KeyParams) => {
    const { datasetId, filename } = params;
    const { formatedFilename, extension } = getFormatedFilename(filename);

    return {
      fileKey: [
        S3Sources.dataset,
        datasetId,
        `${formatedFilename}${extension ? `.${extension}` : ''}`
      ].join('/'),
      fileParsedPrefix: [S3Sources.dataset, datasetId, `${formatedFilename}-parsed`].join('/')
    };
  },

  s3Key: (key: string) => {
    const prefix = `${path.dirname(key)}/${path.basename(key, path.extname(key))}-parsed`;
    return {
      fileKey: key,
      fileParsedPrefix: prefix
    };
  },

  rawText: ({ hash, customPdfParse }: { hash: string; customPdfParse?: boolean }) => {
    return [S3Sources.rawText, `${hash}${customPdfParse ? '-true' : ''}`].join('/');
  }
};

/**
 * Check if a key is a valid S3 object key
 * @param key - The key to check
 * @param source - The source of the key
 * @returns True if the key is a valid S3 object key
 */
export function isS3ObjectKey<T extends keyof typeof S3Sources>(
  key: string | undefined | null,
  source: T
): key is `${T}/${string}` {
  return typeof key === 'string' && key.startsWith(`${S3Sources[source]}/`);
}
