import { detect } from 'jschardet';
import { documentFileType, imageFileType } from './constants';
import { ChatFileTypeEnum } from '../../core/chat/constants';
import { UserChatItemValueItemType } from '../../core/chat/type';
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
  const parseUrl = new URL(url, 'https://locaohost:3000');

  const filename = (() => {
    // Check base64 image
    if (url.startsWith('data:image/')) {
      const mime = url.split(',')[0].split(':')[1].split(';')[0];
      return `image.${mime.split('/')[1]}`;
    }
    // Old version file url: https://xxx.com/file/read?filename=xxx.pdf
    const filenameQuery = parseUrl.searchParams.get('filename');
    if (filenameQuery) return filenameQuery;

    // Common file： https://xxx.com/xxx.pdf?xxxx=xxx
    const pathname = parseUrl.pathname;
    if (pathname) return pathname.split('/').pop();
  })();

  if (!filename) return;

  const extension = filename.split('.').pop()?.toLowerCase() || '';

  if (!extension) return;

  if (documentFileType.includes(extension)) {
    return {
      type: ChatFileTypeEnum.file,
      name: filename,
      url
    };
  }
  if (imageFileType.includes(extension)) {
    return {
      type: ChatFileTypeEnum.image,
      name: filename,
      url
    };
  }
};
