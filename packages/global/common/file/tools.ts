import { detect } from 'jschardet';
import { imageFileType } from './constants';
import { ChatFileTypeEnum } from '../../core/chat/constants';
import { type UserChatItemFileItemType } from '../../core/chat/type';
import * as fs from 'fs';
import path from 'path';

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const detectFileEncoding = (buffer: Buffer) => {
  return detect(buffer.slice(0, 200))?.encoding?.toLocaleLowerCase();
};
export const detectFileEncodingByPath = async (path: string) => {
  // Get 64KB file head
  const MAX_BYTES = 64 * 1024;
  const buffer = Buffer.alloc(MAX_BYTES);

  const fd = await fs.promises.open(path, 'r');
  try {
    // Read file head
    // @ts-ignore
    const { bytesRead } = await fd.read(buffer, 0, MAX_BYTES, 0);
    const actualBuffer = buffer.slice(0, bytesRead);

    return detect(actualBuffer)?.encoding?.toLocaleLowerCase();
  } finally {
    await fd.close();
  }
};

// Url => user upload file type
export const parseUrlToFileType = (url: string): UserChatItemFileItemType | undefined => {
  if (typeof url !== 'string') return;

  // Handle base64 image
  if (url.startsWith('data:')) {
    const matches = url.match(/^data:([^;]+);base64,/);
    if (!matches) return;

    const mimeType = matches[1].toLowerCase();
    if (!mimeType.startsWith('image/')) return;

    const extension = mimeType.split('/')[1];
    return {
      type: ChatFileTypeEnum.image,
      name: `image.${extension}`,
      url
    };
  }

  try {
    const parseUrl = new URL(url, 'http://localhost:3000');

    // Get filename from URL
    const filename = (() => {
      // Here is a S3 Object Key
      if (url.startsWith('chat/')) {
        const basename = path.basename(url);
        // Return empty if no extension
        return basename.includes('.') ? basename : '';
      }

      const fromParam = parseUrl.searchParams.get('filename');
      if (fromParam) {
        return fromParam;
      }

      const basename = path.basename(parseUrl.pathname);
      // Return empty if no extension
      return basename.includes('.') ? basename : '';
    })();
    const extension = filename?.split('.').pop()?.toLowerCase() || '';

    if (extension && imageFileType.includes(extension)) {
      // Default to file type for non-extension files
      return {
        type: ChatFileTypeEnum.image,
        name: filename || 'null',
        url
      };
    }
    // If it's a document type, return as file, otherwise treat as image
    return {
      type: ChatFileTypeEnum.file,
      name: filename || 'null',
      url
    };
  } catch (error) {
    return {
      type: ChatFileTypeEnum.file,
      name: url,
      url
    };
  }
};
