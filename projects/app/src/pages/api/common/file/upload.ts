import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { uploadFile } from '@fastgpt/service/common/file/gridfs/controller';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import { NextAPI } from '@/service/middleware/entry';
import { createFileToken } from '@fastgpt/service/support/permission/controller';
import { ReadFileBaseUrl } from '@fastgpt/global/common/file/constants';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  /* Creates the multer uploader */
  const upload = getUploadModel({
    maxSize: (global.feConfigs?.uploadFileMaxSize || 500) * 1024 * 1024
  });
  const filePaths: string[] = [];

  try {
    const { file, bucketName, metadata } = await upload.doUpload(req, res);

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

    jsonRes<{
      fileId: string;
      previewUrl: string;
    }>(res, {
      data: {
        fileId,
        previewUrl: `${ReadFileBaseUrl}?filename=${file.originalname}&token=${await createFileToken(
          {
            bucketName,
            teamId,
            tmbId,
            fileId
          }
        )}`
      }
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }

  removeFilesByPaths(filePaths);
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
