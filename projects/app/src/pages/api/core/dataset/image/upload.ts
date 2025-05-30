import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadFileBaseUrl } from '@fastgpt/global/common/file/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { authFrequencyLimit } from '@/service/common/frequencyLimit/api';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createDatasetImage } from '@fastgpt/service/core/dataset/image/controller';
import { addSeconds } from 'date-fns';
import { t } from 'i18next';

export type UploadDatasetImageProps = {
  datasetId: string;
  collectionId?: string;
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
    // Create multer uploader
    const upload = getUploadModel({
      maxSize: global.feConfigs?.uploadFileMaxSize
    });
    const { file, metadata, data } = await upload.doUpload<UploadDatasetImageProps>(req, res);
    filePaths.push(file.path);

    // Verify permissions
    const imageData = data as UploadDatasetImageProps;
    const authData = await authDataset({
      datasetId: imageData.datasetId,
      per: WritePermissionVal,
      req,
      authToken: true
    });

    // Check if dataset has a VLM model configured
    if (!authData.dataset.vlmModel) {
      return Promise.reject(new Error(t('file:Image_dataset_requires_VLM_model_to_be_configured')));
    }

    // Verify upload frequency limit
    await authUploadLimit(authData.tmbId);

    addLog.info(`Upload dataset image success ${file.originalname}, cost ${Date.now() - start}ms`);

    // Create image record in new table
    const id = await createDatasetImage({
      teamId: authData.teamId,
      datasetId: imageData.datasetId,
      collectionId: imageData.collectionId,
      name: file.originalname,
      path: file.path,
      contentType: file.mimetype,
      size: file.size,
      metadata
    });

    return id;
  } catch (error) {
    return Promise.reject(error);
  } finally {
    removeFilesByPaths(filePaths);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
