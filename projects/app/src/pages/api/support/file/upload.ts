import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';
import { customAlphabet } from 'nanoid';
import multer from 'multer';
import path from 'path';

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
const maxSize = 50 * 1024 * 1024;
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
    return new Promise<{ files: FileType[]; metadata: Record<string, any> }>((resolve, reject) => {
      // @ts-ignore
      this.uploader(req, res, (error) => {
        if (error) {
          return reject(error);
        }

        resolve({
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
    const { userId } = await authUser({ req, authToken: true });

    const { files, metadata } = await upload.doUpload(req, res);

    const gridFs = new GridFSStorage('dataset', userId);

    const upLoadResults = await Promise.all(
      files.map((file) =>
        gridFs.save({
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
