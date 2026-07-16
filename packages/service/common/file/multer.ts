import { getNanoid } from '@fastgpt/global/common/string/tools';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import m from 'multer';
import type { NodeHttpRequest } from '../../types/http';
import path from 'path';
import fs from 'node:fs';
import { normalizeAllowedExtensions, normalizeFileExtension } from '../s3/utils/uploadConstraints';

type MulterFileFilterOptions = {
  allowedExtensions?: string[];
};

type MultipartRequest = NodeHttpRequest & {
  body?: Record<string, unknown>;
  file?: Express.Multer.File;
  files?: Express.Multer.File[];
};

const buildFileFilter = (allowedExtensions: string[]) => {
  const allowed = new Set(normalizeAllowedExtensions(allowedExtensions));
  if (allowed.size === 0) return undefined;

  const fileFilter: m.Options['fileFilter'] = (_req, file, cb) => {
    try {
      const ext = normalizeFileExtension(path.extname(decodeURIComponent(file.originalname || '')));
      if (!ext || !allowed.has(ext)) {
        return cb(new Error(S3ErrEnum.invalidUploadFileType));
      }
      cb(null, true);
    } catch {
      cb(new Error(S3ErrEnum.invalidUploadFileType));
    }
  };
  return fileFilter;
};

export const multer = {
  _storage: m.diskStorage({
    filename: (_, file, cb) => {
      if (!file?.originalname) {
        cb(new Error('File not found'), '');
      } else {
        const ext = path.extname(decodeURIComponent(file.originalname));
        cb(null, `${getNanoid()}${ext}`);
      }
    }
  }),

  singleStore(maxFileSize: number = 500, options?: MulterFileFilterOptions) {
    const fileSize = maxFileSize * 1024 * 1024;
    const fileFilter = options?.allowedExtensions?.length
      ? buildFileFilter(options.allowedExtensions)
      : undefined;

    return m({
      limits: {
        fileSize
      },
      preservePath: true,
      storage: this._storage,
      ...(fileFilter ? { fileFilter } : {})
    }).single('file');
  },

  multipleStore(maxFileSize: number = 500, options?: MulterFileFilterOptions) {
    const fileSize = maxFileSize * 1024 * 1024;
    const fileFilter = options?.allowedExtensions?.length
      ? buildFileFilter(options.allowedExtensions)
      : undefined;

    return m({
      limits: {
        fileSize
      },
      preservePath: true,
      storage: this._storage,
      ...(fileFilter ? { fileFilter } : {})
    }).array('file', global.feConfigs.uploadFileMaxAmount);
  },

  resolveFormData<T extends Record<string, any>>({
    request,
    maxFileSize,
    allowedExtensions
  }: {
    request: MultipartRequest;
    maxFileSize?: number;
    allowedExtensions?: string[];
  }) {
    return new Promise<{
      data: T;
      fileMetadata: Express.Multer.File;
      getBuffer: () => Buffer;
      getReadStream: () => fs.ReadStream;
    }>((resolve, reject) => {
      const handler = this.singleStore(maxFileSize, { allowedExtensions });

      // @ts-expect-error Multer 声明要求完整 Express Request，运行时兼容 IncomingMessage。
      handler(request, null, (error) => {
        if (error) {
          return reject(error);
        }

        const file = request.file;

        if (!file) {
          return reject(new Error('File not found'));
        }

        const bodyFields =
          request.body && typeof request.body === 'object'
            ? (request.body as Record<string, unknown>)
            : {};
        const plainFields = Object.fromEntries(
          Object.entries(bodyFields).filter(([key]) => key !== 'data')
        );
        const parsedData = (() => {
          const rawData = bodyFields.data;
          if (typeof rawData !== 'string') return {};
          try {
            const parsed = JSON.parse(rawData);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
          } catch {
            return {};
          }
        })();
        // 支持 data JSON 包装和普通 multipart 字段；data 中的值优先级更高，保持旧兼容语义。
        const data = {
          ...plainFields,
          ...parsedData
        } as T;

        resolve({
          data,
          fileMetadata: file,
          getBuffer: () => fs.readFileSync(file.path),
          getReadStream: () => fs.createReadStream(file.path)
        });
      });
    });
  },

  resolveMultipleFormData<T extends Record<string, any>>({
    request,
    maxFileSize,
    allowedExtensions
  }: {
    request: MultipartRequest;
    maxFileSize?: number;
    allowedExtensions?: string[];
  }) {
    return new Promise<{
      data: T;
      fileMetadata: Array<Express.Multer.File>;
    }>((resolve, reject) => {
      const handler = this.multipleStore(maxFileSize, { allowedExtensions });

      // @ts-expect-error Multer 声明要求完整 Express Request，运行时兼容 IncomingMessage。
      handler(request, null, (error) => {
        if (error) {
          return reject(error);
        }

        const files = request.files;

        if (!files || files.length === 0) {
          return reject(new Error('File not found'));
        }

        const data = (() => {
          const rawData = request.body?.data;
          if (typeof rawData !== 'string') return {};
          try {
            return JSON.parse(rawData);
          } catch {
            return {};
          }
        })();

        resolve({
          data,
          fileMetadata: files
        });
      });
    });
  },

  clearDiskTempFiles(filepaths: string[]) {
    for (const filepath of filepaths) {
      fs.rm(filepath, { force: true }, (_) => {});
    }
  }
};
