import { isAfter } from 'date-fns';
import type { ClientSession } from 'mongoose';
import { MongoS3TTL } from './models/ttl';
import { S3Buckets } from './config/constants';
import { S3PrivateBucket } from './buckets/private';
import { S3Sources, type UploadImage2S3BucketParams } from './contracts/type';
import { S3PublicBucket } from './buckets/public';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import path from 'node:path';
import type { ParsedFileContentS3KeyParams } from './sources/dataset/type';
import type { HelperBotTypeEnumType } from '@fastgpt/global/core/chat/helperBot/type';
import { HelperBotTypeEnumSchema } from '@fastgpt/global/core/chat/helperBot/type';

export { jwtSignS3ObjectKey, jwtVerifyS3ObjectKey, jwtSignS3DownloadToken } from './security/token';

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
  const { base64Img, buffer: inputBuffer, filename, mimetype, uploadKey, expiredTime } = params;

  const bucket = bucketName === 'private' ? new S3PrivateBucket() : new S3PublicBucket();

  const buffer = (() => {
    if (inputBuffer) return inputBuffer;
    const base64Data = base64Img?.split(',')[1] || base64Img;
    if (!base64Data) {
      throw new Error('base64Img or buffer is required');
    }
    return Buffer.from(base64Data, 'base64');
  })();

  await bucket.client.uploadObject({
    key: uploadKey,
    body: buffer,
    contentType: mimetype,
    metadata: {
      uploadTime: new Date().toISOString(),
      originFilename: encodeURIComponent(filename)
    }
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

export const getFormatedFilename = (filename?: string) => {
  if (!filename) {
    return {
      formatedFilename: getNanoid(12),
      extension: ''
    };
  }

  const id = getNanoid(6);
  // 先截断文件名，再进行格式化
  const truncatedFilename = truncateFilename(filename);
  // 移除扩展名
  const extension = path.extname(truncatedFilename);
  let name = sanitizeS3ObjectKey(path.basename(truncatedFilename, extension));

  // 移除末尾的 (_随机数)
  const splitName = name.split('_');
  if (splitName.length > 1 && splitName[splitName.length - 1]?.length === 6) {
    splitName.pop();
    name = splitName.join('_');
  }

  return {
    formatedFilename: `${name}_${id}`,
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
    filename?: string;
  }) => {
    const { formatedFilename, extension } = getFormatedFilename(filename);
    const basePrefix = [S3Sources.chat, appId, uId, chatId].filter(Boolean).join('/');

    return {
      fileKey: [basePrefix, `${formatedFilename}${extension ? `.${extension}` : ''}`].join('/'),
      fileParsedPrefix: [basePrefix, `${formatedFilename}-parsed`].join('/')
    };
  },

  helperBot: ({
    type,
    chatId,
    userId,
    filename
  }: {
    type: HelperBotTypeEnumType;
    chatId: string;
    userId: string;
    filename: string;
  }) => {
    const { formatedFilename, extension } = getFormatedFilename(filename);
    const basePrefix = [S3Sources.helperBot, type, userId, chatId].filter(Boolean).join('/');
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
    // 特殊处理，不包含/的key，认为是根级别的key
    if (!key.includes('/')) {
      return {
        fileKey: key,
        fileParsedPrefix: `${path.basename(key, path.extname(key))}-parsed`
      };
    }

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

/**
 * 解析聊天文件的 S3 key。
 *
 * 聊天文件 key 的授权边界由 appId、uid、chatId 共同决定。任何签名或读取前都应先解析
 * 这些路径段并与已鉴权上下文绑定，避免只校验一个无关 app 后签发任意 object key。
 */
export function parseChatFileS3Key(key: string): {
  appId: string;
  uid: string;
  chatId: string;
  filename: string;
} | null {
  if (!isS3ObjectKey(key, 'chat')) return null;

  const [, appId, uid, chatId, ...filenameParts] = key.split('/');
  const filename = filenameParts.join('/');

  if (!appId || !uid || !chatId || !filename) return null;

  return {
    appId,
    uid,
    chatId,
    filename
  };
}

/**
 * 判断聊天文件 key 是否属于已鉴权的 app 与聊天用户。
 */
export function isAuthorizedChatFileS3Key({
  key,
  appId,
  uid
}: {
  key: string;
  appId: string;
  uid: string;
}) {
  const parsedKey = parseChatFileS3Key(key);

  return (
    !!parsedKey &&
    String(parsedKey.appId) === String(appId) &&
    String(parsedKey.uid) === String(uid)
  );
}

/**
 * 解析数据集文件的 S3 key。
 *
 * 数据集文件的第二段是 datasetId。调用方应基于解析出的 datasetId 做权限校验，而不是把
 * S3 对象存在性当作访问权限。
 */
export function parseDatasetFileS3Key(key: string): {
  datasetId: string;
  filename: string;
} | null {
  if (!isS3ObjectKey(key, 'dataset')) return null;

  const [, datasetId, ...filenameParts] = key.split('/');
  const filename = filenameParts.join('/');

  if (!datasetId || !filename) return null;

  return {
    datasetId,
    filename
  };
}

/**
 * 判断数据集文件 key 是否属于指定 dataset。
 */
export function isAuthorizedDatasetFileS3Key({
  key,
  datasetId
}: {
  key: string;
  datasetId: string;
}) {
  const parsedKey = parseDatasetFileS3Key(key);

  return !!parsedKey && String(parsedKey.datasetId) === String(datasetId);
}

/**
 * 解析 HelperBot 文件 key。
 *
 * HelperBot 文件 key 的第一段是固定 source，后续才是 type/user/chat 维度。
 */
export function parseHelperBotFileS3Key(key: string): {
  type: HelperBotTypeEnumType;
  userId: string;
  chatId: string;
  filename: string;
} | null {
  if (!isS3ObjectKey(key, 'helperBot')) return null;

  const [, type, userId, chatId, ...filenameParts] = key.split('/');
  const filename = filenameParts.join('/');
  const parsedType = HelperBotTypeEnumSchema.safeParse(type);

  if (!parsedType.success || !userId || !chatId || !filename) return null;

  return {
    type: parsedType.data,
    userId,
    chatId,
    filename
  };
}

/**
 * 判断 HelperBot 文件 key 是否属于当前用户。
 */
export function isAuthorizedHelperBotFileS3Key({ key, userId }: { key: string; userId: string }) {
  const parsedKey = parseHelperBotFileS3Key(key);

  return !!parsedKey && String(parsedKey.userId) === String(userId);
}

/**
 * 判断临时文件 key 是否属于指定团队。
 */
export function isAuthorizedTempFileS3Key({ key, teamId }: { key: string; teamId: string }) {
  return isS3ObjectKey(key, 'temp') && key.startsWith(`temp/${teamId}/`);
}

export function sanitizeS3ObjectKey(key: string) {
  // 替换掉圆括号
  const replaceParentheses = (key: string) => {
    return key.replace(/[()]/g, (match) => (match === '(' ? '[' : ']'));
  };

  key = replaceParentheses(key);

  return key;
}
