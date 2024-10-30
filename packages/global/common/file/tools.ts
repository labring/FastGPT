import { detect } from 'jschardet';
import { documentFileType, imageFileType } from './constants';
import { ChatFileTypeEnum } from '../../core/chat/constants';
import { UserChatItemValueItemType } from '../../core/chat/type';

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

export const parseUrlToFileType = (url: string): UserChatItemValueItemType['file'] | undefined => {
  const parseUrl = new URL(url, 'https://locaohost:3000');

  const filename = (() => {
    // 来自我们系统上传的文件
    const filenameQuery = parseUrl.searchParams.get('filename');
    if (filenameQuery) return filenameQuery;

    // 一般文件链接： https://xxx.com/xxx.pdf?xxxx=xxx
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
