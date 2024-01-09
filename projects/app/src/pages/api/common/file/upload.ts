import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { uploadFile } from '@fastgpt/service/common/file/gridfs/controller';
import { getUploadModel, removeFilesByPaths } from '@fastgpt/service/common/file/upload/multer';

/**
 * Creates the multer uploader
 */
const upload = getUploadModel({
  maxSize: 500 * 1024 * 1024
});

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  let filePaths: string[] = [];

  try {
    const { files, bucketName, metadata } = await upload.doUpload(req, res);

    filePaths = files.map((file) => file.path);

    await connectToDatabase();
    const { userId, teamId, tmbId } = await authCert({ req, authToken: true });

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

  removeFilesByPaths(filePaths);
}

export const config = {
  api: {
    bodyParser: false
  }
};
