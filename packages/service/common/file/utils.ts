import { isProduction } from '@fastgpt/global/common/system/constants';
import fs from 'fs';
import path from 'path';

export const getFileMaxSize = () => {
  const mb = global.feConfigs?.uploadFileMaxSize || 1000;
  return mb * 1024 * 1024;
};

export const removeFilesByPaths = (paths: string[]) => {
  paths.forEach((path) => {
    fs.unlink(path, (err) => {
      if (err) {
        // console.error(err);
      }
    });
  });
};

export const getContentTypeFromHeader = (header: string): string | undefined => {
  return header?.toLowerCase()?.split(';')?.[0]?.trim();
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
