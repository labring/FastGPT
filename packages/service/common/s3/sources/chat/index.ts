import { S3PrivateBucket } from '../../buckets/private';
import { S3Sources } from '../../contracts/type';
import {
  type CheckChatFileKeys,
  type DelChatFileByPrefixParams,
  ChatFileUploadSchema,
  DelChatFileByPrefixSchema,
  UploadChatFileSchema,
  type UploadFileParams
} from './type';
import { differenceInHours } from 'date-fns';
import { S3Buckets } from '../../config/constants';
import path from 'path';
import { createOpaqueS3FileKey, getS3ParsedPrefix, isOpaqueS3FileKey } from '../../opaqueKey';
import type { ChatS3SourceType } from './type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { createUploadConstraints } from '../../utils/uploadConstraints';
import { encodeS3ObjectKeySegment } from '../../keySanitizer';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getLogger, LogCategories } from '../../../logger';

const logger = getLogger(LogCategories.INFRA.S3);
const getChatFileScope = ({
  sourceType,
  sourceId,
  chatId,
  uId
}: {
  sourceType: ChatS3SourceType;
  sourceId: string;
  chatId?: string;
  uId?: string;
}) =>
  [S3Sources.chat, sourceType, sourceId, uId, chatId].filter((segment): segment is string =>
    Boolean(segment)
  );

const getChatFilePrefix = (params: Parameters<typeof getChatFileScope>[0]) =>
  getChatFileScope(params).map(encodeS3ObjectKeySegment).join('/');

const getChatFileS3Key = ({
  sourceType,
  sourceId,
  chatId,
  uId,
  filename
}: {
  sourceType: ChatS3SourceType;
  sourceId: string;
  chatId: string;
  uId: string;
  filename?: string;
}) => {
  const { objectKey, parsedPrefix } = createOpaqueS3FileKey({
    prefix: getChatFileScope({ sourceType, sourceId, chatId, uId }),
    filename
  });
  return {
    fileKey: objectKey,
    fileParsedPrefix: parsedPrefix
  };
};

export class S3ChatSource extends S3PrivateBucket {
  constructor() {
    super();
  }

  static parseChatUrl(url: string | URL) {
    try {
      const parseUrl = new URL(url);
      const pathname = parseUrl.pathname;
      // 非 S3 key
      if (!pathname.startsWith(`/${S3Buckets.private}/${S3Sources.chat}/`)) {
        return {
          filename: '',
          extension: '',
          imageParsePrefix: ''
        };
      }

      const objectKey = pathname.slice(`/${S3Buckets.private}/`.length);
      const encodedFilename = path.basename(objectKey) || 'file';
      const filename = (() => {
        try {
          return decodeURIComponent(encodedFilename);
        } catch {
          return encodedFilename;
        }
      })();
      const extension = path.extname(filename);

      return {
        filename,
        extension: extension.replace('.', ''),
        imageParsePrefix: getS3ParsedPrefix(objectKey)
      };
    } catch {
      return {
        filename: '',
        extension: '',
        imageParsePrefix: ''
      };
    }
  }

  async createGetChatFileURL(params: {
    key: string;
    expiredHours?: number;
    external: boolean;
    filename?: string;
  }) {
    const { key, expiredHours = 1, external = false, filename } = params; // 默认一个小时
    const fileMetadata =
      external && isOpaqueS3FileKey(key) && !filename
        ? await this.getFileMetadata(key).catch((error) => {
            if (error !== CommonErrEnum.fileNotFound) {
              logger.warn('Failed to resolve opaque chat filename from S3 metadata', {
                key,
                error
              });
            }
            return undefined;
          })
        : undefined;

    if (external) {
      return await this.createExternalUrl({
        key,
        expiredHours,
        filename: filename || fileMetadata?.filename
      });
    }
    return await this.createPreviewUrl({ key, expiredHours });
  }

  async createUploadChatFileURL(params: CheckChatFileKeys) {
    const {
      sourceType,
      sourceId,
      chatId,
      uId,
      filename,
      contentType,
      declaredExtension,
      declaredFilename,
      size,
      expiredTime,
      maxFileSize,
      allowedExtensions,
      extensionRules
    } = ChatFileUploadSchema.parse(params);
    const { fileKey } = getChatFileS3Key({ sourceType, sourceId, chatId, uId, filename });
    const uploadPolicy = createUploadConstraints({
      filename,
      ...(contentType ? { contentType } : {}),
      ...(declaredExtension ? { declaredExtension } : {}),
      ...(declaredFilename ? { declaredFilename } : {}),
      ...(size !== undefined ? { size } : {}),
      uploadConstraints: {
        allowedExtensions,
        extensionRules
      }
    });
    return await this.createUploadAccessUrl(
      {
        rawKey: fileKey,
        filename,
        ...(contentType ? { contentType } : {}),
        ...(declaredExtension ? { declaredExtension } : {}),
        ...(declaredFilename ? { declaredFilename } : {}),
        ...(size !== undefined ? { size } : {})
      },
      {
        expiredHours: expiredTime ? differenceInHours(expiredTime, new Date()) : 1,
        maxFileSize,
        uploadPolicy
      }
    );
  }

  async deleteChatFilesByPrefix(params: DelChatFileByPrefixParams) {
    const { sourceType, sourceId, chatId, uId } = DelChatFileByPrefixSchema.parse(params);

    const rawPrefix = [S3Sources.chat, sourceType, sourceId, uId, chatId].filter(Boolean).join('/');
    const prefix = getChatFilePrefix({ sourceType, sourceId, chatId, uId });
    const publicBucket = global.s3BucketMap[S3Buckets.public];

    const prefixes = [...new Set([prefix, rawPrefix])];
    await Promise.all(prefixes.map((item) => this.addDeleteJob({ prefix: item })));
    await Promise.all(prefixes.map((item) => publicBucket.addDeleteJob({ prefix: item })));

    if (sourceType === ChatSourceTypeEnum.app) {
      const rawLegacyPrefix = [S3Sources.chat, sourceId, uId, chatId].filter(Boolean).join('/');
      const legacyPrefix = [S3Sources.chat, sourceId, uId, chatId]
        .filter((segment): segment is string => Boolean(segment))
        .map(encodeS3ObjectKeySegment)
        .join('/');
      const legacyPrefixes = [...new Set([legacyPrefix, rawLegacyPrefix])];
      await Promise.all(legacyPrefixes.map((item) => this.addDeleteJob({ prefix: item })));
      await Promise.all(legacyPrefixes.map((item) => publicBucket.addDeleteJob({ prefix: item })));
    }

    return prefix;
  }

  deleteChatFileByKey(key: string) {
    this.addDeleteJob({ key });
    return key;
  }

  async uploadChatFile(params: UploadFileParams) {
    const { sourceType, sourceId, chatId, uId, filename, body, contentType, expiredTime } =
      UploadChatFileSchema.parse(params);
    const { fileKey } = getChatFileS3Key({
      sourceType,
      sourceId,
      chatId,
      uId,
      filename
    });

    return this.uploadFileByBody({
      key: fileKey,
      filename,
      body,
      contentType,
      expiredTime
    });
  }

  getToolFilePrefix(params: {
    sourceType: ChatS3SourceType;
    sourceId: string;
    chatId: string;
    uId: string;
  }) {
    const { sourceType, sourceId, chatId, uId } = params;
    return getChatFilePrefix({ sourceType, sourceId, chatId, uId });
  }
}

export function getS3ChatSource() {
  if (global.chatBucket) {
    return global.chatBucket;
  }
  global.chatBucket = new S3ChatSource();
  return global.chatBucket;
}

export const createChatFilePreviewUrlGetter = (options?: { expiredHours?: number }) => {
  const s3ChatSource = getS3ChatSource();

  return async (key: string, filename?: string) => {
    const { url } = await s3ChatSource.createGetChatFileURL({
      key,
      external: true,
      ...(filename ? { filename } : {}),
      ...options
    });
    return url;
  };
};
