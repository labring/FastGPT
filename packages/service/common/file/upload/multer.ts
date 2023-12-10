import type { NextApiRequest, NextApiResponse } from 'next';
import { customAlphabet } from 'nanoid';
import multer from 'multer';
import path from 'path';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';

const nanoid = customAlphabet('1234567890abcdef', 12);

type FileType = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  filename: string;
  path: string;
  size: number;
};

export function getUploadModel({ maxSize = 500 }: { maxSize?: number }) {
  maxSize *= 1024 * 1024;
  class UploadModel {
    uploader = multer({
      limits: {
        fieldSize: maxSize
      },
      preservePath: true,
      storage: multer.diskStorage({
        filename: (_req, file, cb) => {
          const filename = decodeURIComponent(file.originalname);
          const { ext } = path.parse(filename);
          cb(null, nanoid() + ext);
        }
      })
    }).any();

    async doUpload<T = Record<string, any>>(req: NextApiRequest, res: NextApiResponse) {
      return new Promise<{
        files: FileType[];
        metadata: T;
        bucketName?: `${BucketNameEnum}`;
      }>((resolve, reject) => {
        this.uploader(req as unknown as Request, res, (error) => {
          if (error) {
            return reject(error);
          }

          resolve({
            ...req.body,
            files: req.files?.map((file) => ({
              ...file,
              originalname: decodeURIComponent(file.originalname)
            })) || [],
            metadata: (() => {
              if (!req.body?.metadata) return {};
              try {
                return JSON.parse(req.body.metadata);
              } catch (error) {
                console.log(error);
                return {};
              }
            })()
          });
        });
      });
    }
  }

  return new UploadModel();
}
