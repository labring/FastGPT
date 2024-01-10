import type { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import path from 'path';
import { BucketNameEnum, bucketNameMap } from '@fastgpt/global/common/file/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { tmpFileDirPath } from './constants';

type FileType = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  filename: string;
  path: string;
  size: number;
};

const expiredTime = 30 * 60 * 1000;

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
        filename: async (req, file, cb) => {
          const { ext } = path.parse(decodeURIComponent(file.originalname));
          cb(null, `${Date.now() + expiredTime}-${getNanoid(32)}${ext}`);
        }
      })
    }).any();

    async doUpload<T = Record<string, any>>(req: NextApiRequest, res: NextApiResponse) {
      return new Promise<{
        files: FileType[];
        metadata: T;
        bucketName?: `${BucketNameEnum}`;
      }>((resolve, reject) => {
        // @ts-ignore
        this.uploader(req, res, (error) => {
          if (error) {
            return reject(error);
          }

          // check bucket name
          const bucketName = req.body?.bucketName as `${BucketNameEnum}`;
          if (bucketName && !bucketNameMap[bucketName]) {
            return reject('BucketName is invalid');
          }

          resolve({
            ...req.body,
            files:
              // @ts-ignore
              req.files?.map((file) => ({
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
};
