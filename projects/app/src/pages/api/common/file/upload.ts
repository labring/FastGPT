import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { uploadFile } from '@fastgpt/service/common/file/gridfs/controller';
import { getUploadModel } from '@fastgpt/service/common/file/multer';

/**
 * Creates the multer uploader
 */
const upload = getUploadModel({
  maxSize: 500 * 1024 * 1024
});

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  let filePaths: string[] = [];

  try {
    const { userId, teamId, tmbId } = await authCert({ req, authToken: true });

    const { files, bucketName, metadata } = await upload.doUpload(req, res);

    filePaths = files.map((file) => file.path);

    await connectToDatabase();

    if (!bucketName) {
      throw new Error('bucketName is empty');
    }

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
