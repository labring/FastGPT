import type { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import path from 'path';
import { BucketNameEnum, bucketNameMap } from '@fastgpt/global/common/file/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export type FileType = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  filename: string;
  path: string;
  size: number;
};

/* 
  maxSize: File max size (MB)
*/
export const getUploadModel = ({ maxSize = 500 }: { maxSize?: number }) => {
  maxSize *= 1024 * 1024;

  class UploadModel {
    uploader = multer({
      limits: {
        fieldSize: maxSize
      },
      preservePath: true,
      storage: multer.diskStorage({
        // destination: (_req, _file, cb) => {
        //   cb(null, tmpFileDirPath);
        // },
        filename: (req, file, cb) => {
          if (!file?.originalname) {
            cb(new Error('File not found'), '');
          } else {
            const { ext } = path.parse(decodeURIComponent(file.originalname));
            cb(null, `${getNanoid()}${ext}`);
          }
        }
      })
    }).single('file');

    async doUpload<T = any>(
      req: NextApiRequest,
      res: NextApiResponse,
      originBucketName?: `${BucketNameEnum}`
    ) {
      return new Promise<{
        file: FileType;
        metadata: Record<string, any>;
        data: T;
        bucketName?: `${BucketNameEnum}`;
      }>((resolve, reject) => {
        // @ts-ignore
        this.uploader(req, res, (error) => {
          if (error) {
            return reject(error);
          }

          // check bucket name
          const bucketName = (req.body?.bucketName || originBucketName) as `${BucketNameEnum}`;
          if (bucketName && !bucketNameMap[bucketName]) {
            return reject('BucketName is invalid');
          }

          // @ts-ignore
          const file = req.file as FileType;

          resolve({
            file: {
              ...file,
              originalname: decodeURIComponent(file.originalname)
            },
            bucketName,
            metadata: (() => {
              if (!req.body?.metadata) return {};
              try {
                return JSON.parse(req.body.metadata);
              } catch (error) {
                return {};
              }
            })(),
            data: (() => {
              if (!req.body?.data) return {};
              try {
                return JSON.parse(req.body.data);
              } catch (error) {
                return {};
              }
            })()
          });
        });
      });
    }
  }

  return new UploadModel();
};
