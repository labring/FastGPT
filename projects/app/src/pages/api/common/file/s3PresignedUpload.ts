import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { authFrequencyLimit } from '@/service/common/frequencyLimit/api';
import { addSeconds } from 'date-fns';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { UploadDatasetFileProps } from './upload';
import {
  postObjectPresignedUrl,
  getObjectPresignedUrl,
  isS3ClientInitialized
} from '@fastgpt/service/common/file/s3';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export type UploadChatFileProps = {
  appId: string;
} & OutLinkChatAuthProps;

const authUploadLimit = (tmbId: string) => {
  if (!global.feConfigs.uploadFileMaxAmount) return;
  return authFrequencyLimit({
    eventId: `${tmbId}-uploadfile`,
    maxAmount: global.feConfigs.uploadFileMaxAmount * 2,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const s3 = isS3ClientInitialized();
    if (!s3) {
      return;
    }
    const maxSize = global.feConfigs?.uploadFileMaxSize;
    const { bucketName, metadata, data, fileName } = req.body;

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

    const chatId = JSON.parse(metadata)?.chatId ?? 'unknown';

    const fileId = `${getNanoid()}.${fileName}`;
    const key = (() => {
      if (bucketName === 'chat') {
        return `${bucketName}/${chatId}/${fileId}`;
      }
      return `${bucketName}/${fileId}`;
    })();

    const presigned = await postObjectPresignedUrl(
      key,
      { teamId, uid, metadata },
      (maxSize ?? 100) * 1024 * 1024,
      10 * 60 * 1000
    );

    const previewUrl = await getObjectPresignedUrl(key, 10 * 60 * 1000);

    return {
      ...presigned,
      fileId,
      previewUrl
    };
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export default NextAPI(handler);
