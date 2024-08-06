import { isProduction } from '../system/constants';
import fs from 'fs';
import path from 'path';

export const removeFilesByPaths = (paths: string[]) => {
  paths.forEach((path) => {
    fs.unlink(path, (err) => {
      if (err) {
        // console.error(err);
      }
    });
  });
};

export const guessBase64ImageType = (str: string) => {
  const imageTypeMap: Record<string, string> = {
    '/': 'image/jpeg',
    i: 'image/png',
    R: 'image/gif',
    U: 'image/webp',
    Q: 'image/bmp',
    P: 'image/svg+xml',
    T: 'image/tiff',
    J: 'image/jp2',
    S: 'image/x-tga',
    I: 'image/ief',
    V: 'image/vnd.microsoft.icon',
    W: 'image/vnd.wap.wbmp',
    X: 'image/x-xbitmap',
    Z: 'image/x-xpixmap',
    Y: 'image/x-xwindowdump'
  };

  const defaultType = 'image/jpeg';
  if (typeof str !== 'string' || str.length === 0) {
    return defaultType;
  }

  const firstChar = str.charAt(0);
  return imageTypeMap[firstChar] || defaultType;
};

export const getFileContentTypeFromHeader = (header: string): string | undefined => {
  const contentType = header.split(';')[0];
  return contentType;
};

export const clearDirFiles = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  fs.rmdirSync(dirPath, {
    recursive: true
  });
};

export const clearTmpUploadFiles = () => {
  if (!isProduction) return;
  const tmpPath = '/tmp';

  fs.readdir(tmpPath, (err, files) => {
    if (err) return;

    for (const file of files) {
      if (file === 'v8-compile-cache-0') continue;

      const filePath = path.join(tmpPath, file);

      fs.stat(filePath, (err, stats) => {
        if (err) return;

        // 如果文件是在2小时前上传的，则认为是临时文件并删除它
        if (Date.now() - stats.mtime.getTime() > 2 * 60 * 60 * 1000) {
          fs.unlink(filePath, (err) => {
            if (err) return;
            console.log(`Deleted temp file: ${filePath}`);
          });
        }
      });
    }
  });
};
