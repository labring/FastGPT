import { detect } from 'jschardet';
import { documentFileType } from './constants';
import { ChatFileTypeEnum } from '../../core/chat/constants';
import { type UserChatItemValueItemType } from '../../core/chat/type';
import * as fs from 'fs';

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
export const parseUrlToFileType = (url: string): UserChatItemValueItemType['file'] | undefined => {
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
    const filename = parseUrl.searchParams.get('filename') || parseUrl.pathname.split('/').pop();
    const extension = filename?.split('.').pop()?.toLowerCase() || '';

    // If it's a document type, return as file, otherwise treat as image
    if (extension && documentFileType.includes(extension)) {
      return {
        type: ChatFileTypeEnum.file,
        name: filename || 'null',
        url
      };
    }

    // Default to image type for non-document files
    return {
      type: ChatFileTypeEnum.image,
      name: filename || 'null.png',
      url
    };
  } catch (error) {
    return {
      type: ChatFileTypeEnum.image,
      name: 'invalid.png',
      url
    };
  }
};
