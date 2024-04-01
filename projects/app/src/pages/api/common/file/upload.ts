import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { uploadFile } from '@fastgpt/service/common/file/gridfs/controller';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  /* Creates the multer uploader */
  const upload = getUploadModel({
    maxSize: (global.feConfigs?.uploadFileMaxSize || 500) * 1024 * 1024
  });
  const filePaths: string[] = [];

  try {
    await connectToDatabase();
    const { file, bucketName, metadata } = await upload.doUpload(req, res);

    filePaths.push(file.path);

    const { teamId, tmbId } = await authCert({ req, authToken: true });

    if (!bucketName) {
      throw new Error('bucketName is empty');
    }

    const fileId = await uploadFile({
      teamId,
      tmbId,
      bucketName,
      path: file.path,
      filename: file.originalname,
      contentType: file.mimetype,
      metadata: metadata
    });

    jsonRes(res, {
      data: fileId
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
