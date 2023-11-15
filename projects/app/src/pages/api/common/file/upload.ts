import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { customAlphabet } from 'nanoid';
import multer from 'multer';
import path from 'path';
import { uploadFile } from '@fastgpt/service/common/file/gridfs/controller';
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

/**
 * Creates the multer uploader
 */
const maxSize = 500 * 1024 * 1024;
class UploadModel {
  uploader = multer({
    limits: {
      fieldSize: maxSize
    },
    preservePath: true,
    storage: multer.diskStorage({
      filename: (_req, file, cb) => {
        const { ext } = path.parse(decodeURIComponent(file.originalname));
        cb(null, nanoid() + ext);
      }
    })
  }).any();

  async doUpload(req: NextApiRequest, res: NextApiResponse) {
    return new Promise<{
      files: FileType[];
      bucketName: `${BucketNameEnum}`;
      metadata: Record<string, any>;
    }>((resolve, reject) => {
      // @ts-ignore
      this.uploader(req, res, (error) => {
        if (error) {
          return reject(error);
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

const upload = new UploadModel();

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { userId, teamId, tmbId } = await authCert({ req, authToken: true });
    const { files, bucketName, metadata } = await upload.doUpload(req, res);

    const upLoadResults = await Promise.all(
      files.map((file) =>
        uploadFile({
          teamId,
          tmbId,
          bucketName,
          path: file.path,
          filename: file.originalname,
          metadata: {
            ...metadata,
            contentType: file.mimetype,
            userId
          }
        })
      )
    );

    jsonRes(res, {
      data: upLoadResults
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
