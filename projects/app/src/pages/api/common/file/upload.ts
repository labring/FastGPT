import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { uploadFile } from '@fastgpt/service/common/file/gridfs/controller';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import { NextAPI } from '@/service/middleware/entry';
import { createFileToken } from '@fastgpt/service/support/permission/controller';
import { ReadFileBaseUrl } from '@fastgpt/global/common/file/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { authFrequencyLimit } from '@/service/common/frequencyLimit/api';
import { addSeconds } from 'date-fns';
import { authChatCert } from '@/service/support/permission/auth/chat';

const authUploadLimit = (tmbId: string) => {
  if (!global.feConfigs.uploadFileMaxAmount) return;
  return authFrequencyLimit({
    eventId: `${tmbId}-uploadfile`,
    maxAmount: global.feConfigs.uploadFileMaxAmount * 2,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const filePaths: string[] = [];
  try {
    const start = Date.now();
    /* Creates the multer uploader */
    const upload = getUploadModel({
      maxSize: global.feConfigs?.uploadFileMaxSize
    });
    const { file, bucketName, metadata } = await upload.doUpload(req, res);
    filePaths.push(file.path);
    const { teamId, tmbId, outLinkUid } = await authChatCert({
      req,
      authToken: true,
      authApiKey: true
    });

    await authUploadLimit(outLinkUid || tmbId);

    addLog.info(`Upload file success ${file.originalname}, cost ${Date.now() - start}ms`);

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
      data: {
        fileId,
        previewUrl: `${ReadFileBaseUrl}/${file.originalname}?token=${await createFileToken({
          bucketName,
          teamId,
          tmbId,
          fileId
        })}`
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
