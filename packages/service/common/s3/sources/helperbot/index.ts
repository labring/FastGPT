import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { S3PrivateBucket } from '../../buckets/private';
import { S3Sources } from '../../type';
import {
  type CheckHelperBotFileKeys,
  type DelChatFileByPrefixParams,
  DelChatFileByPrefixSchema,
  HelperBotFileUploadSchema
} from './type';
import { differenceInHours } from 'date-fns';
import { S3Buckets } from '../../constants';
import path from 'path';
import { getFileS3Key } from '../../utils';

export class S3HelperBotSource extends S3PrivateBucket {
  private static instance: S3HelperBotSource;

  constructor() {
    super();
  }

  static getInstance() {
    return (this.instance ??= new S3HelperBotSource());
  }

  static parseFileUrl(url: string | URL) {
    try {
      const parseUrl = new URL(url);
      const pathname = decodeURIComponent(parseUrl.pathname);
      // 非 S3 key
      if (!pathname.startsWith(`/${S3Buckets.private}/${S3Sources.helperBot}/`)) {
        return {
          filename: '',
          extension: '',
          imageParsePrefix: ''
        };
      }

      const filename = pathname.split('/').pop() || 'file';
      const extension = path.extname(filename);

      return {
        filename,
        extension: extension.replace('.', ''),
        imageParsePrefix: `${pathname.replace(`/${S3Buckets.private}/`, '').replace(extension, '')}-parsed`
      };
    } catch (error) {
      return {
        filename: '',
        extension: '',
        imageParsePrefix: ''
      };
    }
  }

  parseKey(key: string) {
    const [type, chatId, userId, filename] = key.split('/');
    return { type, chatId, userId, filename };
  }

  async createGetFileURL(params: { key: string; expiredHours?: number; external: boolean }) {
    const { key, expiredHours = 1, external = false } = params; // 默认一个小时

    if (external) {
      return await this.createExternalUrl({ key, expiredHours });
    }
    return await this.createPreviewUrl({ key, expiredHours });
  }

  async createUploadFileURL(params: CheckHelperBotFileKeys) {
    const { type, chatId, userId, filename, expiredTime } = HelperBotFileUploadSchema.parse(params);
    const { fileKey } = getFileS3Key.helperBot({ type, chatId, userId, filename });
    return await this.createPresignedPutUrl(
      { rawKey: fileKey, filename },
      { expiredHours: expiredTime ? differenceInHours(new Date(), expiredTime) : 24 }
    );
  }

  deleteFilesByPrefix(params: DelChatFileByPrefixParams) {
    const { type, chatId, userId } = DelChatFileByPrefixSchema.parse(params);

    const prefix = [S3Sources.helperBot, type, userId, chatId].filter(Boolean).join('/');
    return this.addDeleteJob({ prefix });
  }

  deleteFileByKey(key: string) {
    return this.addDeleteJob({ key });
  }
}

export function getS3HelperBotSource() {
  if (global.helperBotBucket) {
    return global.helperBotBucket;
  }
  global.helperBotBucket = new S3HelperBotSource();
  return global.helperBotBucket;
}

declare global {
  var helperBotBucket: S3HelperBotSource;
}
