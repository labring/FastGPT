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

export class S3HelperBotSource {
  private bucket: S3PrivateBucket;
  private static instance: S3HelperBotSource;

  constructor() {
    this.bucket = new S3PrivateBucket();
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

  // 获取文件流
  getFileStream(key: string) {
    return this.bucket.getObject(key);
  }

  // 获取文件状态
  getFileStat(key: string) {
    return this.bucket.statObject(key);
  }

  // 获取文件元数据
  async getFileMetadata(key: string) {
    const stat = await this.getFileStat(key);
    if (!stat) return { filename: '', extension: '', contentLength: 0, contentType: '' };

    const contentLength = stat.size;
    const filename: string = decodeURIComponent(stat.metaData['origin-filename']);
    const extension = parseFileExtensionFromUrl(filename);
    const contentType: string = stat.metaData['content-type'];
    return {
      filename,
      extension,
      contentType,
      contentLength
    };
  }

  async createGetFileURL(params: { key: string; expiredHours?: number; external: boolean }) {
    const { key, expiredHours = 1, external = false } = params; // 默认一个小时

    if (external) {
      return await this.bucket.createExternalUrl({ key, expiredHours });
    }
    return await this.bucket.createPreviewUrl({ key, expiredHours });
  }

  async createUploadFileURL(params: CheckHelperBotFileKeys) {
    const { type, chatId, userId, filename, expiredTime } = HelperBotFileUploadSchema.parse(params);
    const { fileKey } = getFileS3Key.helperBot({ type, chatId, userId, filename });
    return await this.bucket.createPostPresignedUrl(
      { rawKey: fileKey, filename },
      { expiredHours: expiredTime ? differenceInHours(new Date(), expiredTime) : 24 }
    );
  }

  deleteFilesByPrefix(params: DelChatFileByPrefixParams) {
    const { type, chatId, userId } = DelChatFileByPrefixSchema.parse(params);

    const prefix = [S3Sources.helperBot, type, userId, chatId].filter(Boolean).join('/');
    return this.bucket.addDeleteJob({ prefix });
  }

  deleteFileByKey(key: string) {
    return this.bucket.addDeleteJob({ key });
  }
}

export function getS3HelperBotSource() {
  return S3HelperBotSource.getInstance();
}
