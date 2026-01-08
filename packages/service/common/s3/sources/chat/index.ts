import { S3PrivateBucket } from '../../buckets/private';
import { S3Sources } from '../../type';
import {
  type CheckChatFileKeys,
  type DelChatFileByPrefixParams,
  ChatFileUploadSchema,
  DelChatFileByPrefixSchema,
  UploadChatFileSchema,
  type UploadFileParams
} from './type';
import { differenceInHours } from 'date-fns';
import { S3Buckets } from '../../constants';
import path from 'path';
import { getFileS3Key } from '../../utils';

export class S3ChatSource extends S3PrivateBucket {
  constructor() {
    super();
  }

  static parseChatUrl(url: string | URL) {
    try {
      const parseUrl = new URL(url);
      const pathname = decodeURIComponent(parseUrl.pathname);
      // 非 S3 key
      if (!pathname.startsWith(`/${S3Buckets.private}/${S3Sources.chat}/`)) {
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

  async createGetChatFileURL(params: { key: string; expiredHours?: number; external: boolean }) {
    const { key, expiredHours = 1, external = false } = params; // 默认一个小时

    if (external) {
      return await this.createExternalUrl({ key, expiredHours });
    }
    return await this.createPreviewUrl({ key, expiredHours });
  }

  async createUploadChatFileURL(params: CheckChatFileKeys) {
    const { appId, chatId, uId, filename, expiredTime } = ChatFileUploadSchema.parse(params);
    const { fileKey } = getFileS3Key.chat({ appId, chatId, uId, filename });
    return await this.createPostPresignedUrl(
      { rawKey: fileKey, filename },
      { expiredHours: expiredTime ? differenceInHours(expiredTime, new Date()) : 24 }
    );
  }

  deleteChatFilesByPrefix(params: DelChatFileByPrefixParams) {
    const { appId, chatId, uId } = DelChatFileByPrefixSchema.parse(params);

    const prefix = [S3Sources.chat, appId, uId, chatId].filter(Boolean).join('/');
    return this.addDeleteJob({ prefix });
  }

  deleteChatFileByKey(key: string) {
    return this.addDeleteJob({ key });
  }

  async uploadChatFileByBuffer(params: UploadFileParams) {
    const { appId, chatId, uId, filename, buffer, contentType } =
      UploadChatFileSchema.parse(params);
    const { fileKey } = getFileS3Key.chat({
      appId,
      chatId,
      uId,
      filename
    });

    return this.uploadFileByBuffer({
      key: fileKey,
      buffer,
      contentType
    });
  }
}

export function getS3ChatSource() {
  if (global.chatBucket) {
    return global.chatBucket;
  }
  global.chatBucket = new S3ChatSource();
  return global.chatBucket;
}

declare global {
  var chatBucket: S3ChatSource;
}
