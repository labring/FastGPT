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
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

export type UploadChatFileProps = {
  appId: string;
} & OutLinkChatAuthProps;
export type UploadDatasetFileProps = {
  datasetId: string;
};

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
    const { file, bucketName, metadata, data } = await upload.getUploadFile<
      UploadChatFileProps | UploadDatasetFileProps
    >(req, res);
    filePaths.push(file.path);

    const { teamId, uid } = await (async () => {
      if (bucketName === 'chat') {
        const chatData = data as UploadChatFileProps;
        const authData = await authChatCrud({
          req,
          authToken: true,
          authApiKey: true,
          ...chatData
        });
        return {
          teamId: authData.teamId,
          uid: authData.uid
        };
      }
      if (bucketName === 'dataset') {
        const chatData = data as UploadDatasetFileProps;
        const authData = await authDataset({
          datasetId: chatData.datasetId,
          per: WritePermissionVal,
          req,
          authToken: true,
          authApiKey: true
        });
        return {
          teamId: authData.teamId,
          uid: authData.tmbId
        };
      }
      return Promise.reject('bucketName is empty');
    })();

    await authUploadLimit(uid);

    addLog.info(`Upload file success ${file.originalname}, cost ${Date.now() - start}ms`);

    if (!bucketName) {
      throw new Error('bucketName is empty');
    }

    const fileId = await uploadFile({
      teamId,
      uid,
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
          uid,
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
