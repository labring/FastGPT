import { getNanoid } from '@fastgpt/global/common/string/tools';
import m from 'multer';
import type { NextApiRequest } from 'next';
import path from 'path';
import fs from 'node:fs';
import { checkFileMimeType } from '../file/utils';

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

  singleStore(maxFileSize: number = 500) {
    const fileSize = maxFileSize * 1024 * 1024;

    return m({
      limits: {
        fileSize
      },
      preservePath: true,
      storage: this._storage
    }).single('file');
  },

  multipleStore(maxFileSize: number = 500) {
    const fileSize = maxFileSize * 1024 * 1024;

    return m({
      limits: {
        fileSize
      },
      preservePath: true,
      storage: this._storage
    }).array('file', global.feConfigs?.uploadFileMaxSize);
  },

  resolveFormData<T extends Record<string, any>>({
    request,
    maxFileSize
  }: {
    request: NextApiRequest;
    maxFileSize?: number;
  }) {
    return new Promise<{
      data: T;
      fileMetadata: Express.Multer.File;
      getBuffer: () => Buffer;
      getReadStream: () => fs.ReadStream;
    }>((resolve, reject) => {
      const handler = this.singleStore(maxFileSize);

      // @ts-expect-error it can accept a NextApiRequest
      handler(request, null, async (error) => {
        if (error) {
          return reject(error);
        }

        // @ts-expect-error `file` will be injected by multer
        const file = request.file as Express.Multer.File | undefined;

        if (!file) {
          return reject(new Error('File not found'));
        }

        try {
          const result = await checkFileMimeType({
            from: 'stream',
            file: fs.createReadStream(file.path),
            fileName: file.originalname
          });

          if (result !== file.mimetype) {
            file.mimetype = result;
          }

          const data = (() => {
            if (!request.body?.data) return {};
            try {
              return JSON.parse(request.body.data);
            } catch {
              return {};
            }
          })();

          resolve({
            data,
            fileMetadata: file,
            getBuffer: () => fs.readFileSync(file.path),
            getReadStream: () => fs.createReadStream(file.path)
          });
        } catch (error) {
          this.clearDiskTempFiles([file.path]);
          return reject(error);
        }
      });
    });
  },

  resolveMultipleFormData<T extends Record<string, any>>({
    request,
    maxFileSize
  }: {
    request: NextApiRequest;
    maxFileSize?: number;
  }) {
    return new Promise<{
      data: T;
      fileMetadata: Array<Express.Multer.File>;
    }>((resolve, reject) => {
      const handler = this.multipleStore(maxFileSize);

      // @ts-expect-error it can accept a NextApiRequest
      handler(request, null, async (error) => {
        if (error) {
          return reject(error);
        }

        // @ts-expect-error `files` will be injected by multer
        const files = request.files as Array<Express.Multer.File>;

        const settled = await Promise.allSettled(
          files.map(async (file) => {
            try {
              const result = await checkFileMimeType({
                from: 'stream',
                file: fs.createReadStream(file.path),
                fileName: file.originalname
              });
              if (result !== file.mimetype) {
                file.mimetype = result;
              }
              return file;
            } catch (error) {
              this.clearDiskTempFiles([file.path]);
              throw error;
            }
          })
        );

        const validFiles = settled
          .map(
            (result) => (result.status === 'fulfilled' ? result.value : null) as Express.Multer.File
          )
          .filter(Boolean);

        if (!validFiles || validFiles.length === 0) {
          return reject(new Error('File not found'));
        }

        const data = (() => {
          if (!request.body?.data) return {};
          try {
            return JSON.parse(request.body.data);
          } catch {
            return {};
          }
        })();

        resolve({
          data,
          fileMetadata: validFiles
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
