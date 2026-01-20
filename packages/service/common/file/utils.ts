import { isProduction } from '@fastgpt/global/common/system/constants';
import fs from 'fs';
import path from 'path';
import { isNil } from 'es-toolkit';
import type { FileTypeResult } from 'file-type';
import { fileTypeFromBuffer, fileTypeFromFile, fileTypeFromStream } from 'file-type';
import mime from 'mime-types';

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

const DEFAULT_BINARY_TYPE = {
  ext: 'bin',
  mime: 'application/octet-stream'
};

type FileTypeDetectInput =
  | {
      from: 'buffer';
      file: Uint8Array | ArrayBuffer;
    }
  | {
      from: 'stream';
      file: Parameters<typeof fileTypeFromStream>[0];
    }
  | {
      from: 'path';
      file: string;
    };

/**
 * 基于内容识别文件类型
 */
export async function getFileType(input: FileTypeDetectInput) {
  let result: FileTypeResult | undefined;

  switch (input.from) {
    case 'buffer':
      result = await fileTypeFromBuffer(input.file);
      break;
    case 'stream':
      result = await fileTypeFromStream(input.file);
      break;
    case 'path':
      result = await fileTypeFromFile(input.file);
      break;
  }

  return isNil(result) ? DEFAULT_BINARY_TYPE : { ext: result.ext, mime: result.mime };
}

export const checkFileMimeType = async ({
  // 不传递 allowedMimeTypes 时，默认允许所有 MIME 类型
  fileName,
  allowedMimeTypes,
  allowedTextFallbackMimeTypes,
  ...detectInput
}: FileTypeDetectInput & {
  fileName: string;
  allowedMimeTypes?: Set<string>;
  allowedTextFallbackMimeTypes?: Set<string>;
}): Promise<string> => {
  // 严格模式，不通过文件扩展名推断 MIME 类型
  if (allowedMimeTypes && !allowedTextFallbackMimeTypes) {
    const result = await getFileType(detectInput);

    // file-type 没推断出来类型，或者不在白名单中，拒绝上传
    if (result.mime === 'application/octet-stream' || !allowedMimeTypes?.has(result.mime)) {
      throw new Error(`File type ${result.mime} is not allowed`);
    }

    return result.mime;
  }

  // 宽松模式，适合推断文本文件，通过文件扩展名推断 MIME 类型
  else if (allowedMimeTypes && allowedTextFallbackMimeTypes) {
    const result = await getFileType(detectInput);

    // 不是二进制文件、纯文本文件，但是不在白名单中，拒绝上传
    if (result.mime !== 'application/octet-stream' && !allowedMimeTypes?.has(result.mime)) {
      throw new Error(`File type ${result.mime} is not allowed`);
    }

    // 可能是二进制文件、纯文本文件，通过文件扩展名推断 MIME 类型
    if (result.mime === 'application/octet-stream') {
      const textMimeType = mime.lookup(fileName);

      // mime-types 没推断出来类型，或者不在白名单中，拒绝上传
      if (textMimeType === false || !allowedTextFallbackMimeTypes?.has(textMimeType)) {
        throw new Error(`File type ${textMimeType} is not allowed`);
      }

      return textMimeType;
    }

    return result.mime;
  }

  return 'application/octet-stream';
};

export const getMimeTypeByExtensions = (extensions: string[]): string[] => {
  return extensions
    .map((extension) => {
      return mime.lookup(extension);
    })
    .filter(Boolean) as string[];
};
