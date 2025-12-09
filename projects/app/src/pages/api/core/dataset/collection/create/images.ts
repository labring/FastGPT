import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import type { ImageCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { CreateCollectionResponse } from '@/global/core/dataset/api';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { authFrequencyLimit } from '@/service/common/frequencyLimit/api';
import { addDays, addSeconds } from 'date-fns';
import fs from 'node:fs';
import path from 'node:path';
import { getFileS3Key, uploadImage2S3Bucket } from '@fastgpt/service/common/s3/utils';
import { multer } from '@fastgpt/service/common/file/multer';

const authUploadLimit = (tmbId: string, num: number) => {
  if (!global.feConfigs.uploadFileMaxAmount) return;
  return authFrequencyLimit({
    eventId: `${tmbId}-uploadfile`,
    maxAmount: global.feConfigs.uploadFileMaxAmount * 2,
    expiredTime: addSeconds(new Date(), 30), // 30s
    num
  });
};

async function handler(
  req: ApiRequestProps<ImageCreateDatasetCollectionParams>
): CreateCollectionResponse {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveMultipleFormData({
      request: req,
      maxFileSize: global.feConfigs?.uploadFileMaxSize
    });
    filepaths.push(...result.fileMetadata.map((item) => item.path));
    const { parentId, datasetId, collectionName } = result.data;

    const { dataset, teamId, tmbId } = await authDataset({
      datasetId,
      per: WritePermissionVal,
      req,
      authToken: true,
      authApiKey: true
    });

    await authUploadLimit(tmbId, result.fileMetadata.length);

    if (!dataset.vlmModel) {
      return Promise.reject(i18nT('file:Image_dataset_requires_VLM_model_to_be_configured'));
    }

    const imageIds = await Promise.all(
      result.fileMetadata.map(async (file) => {
        const filename = path.basename(file.filename);
        const { fileKey } = getFileS3Key.dataset({ datasetId, filename });
        return uploadImage2S3Bucket('private', {
          base64Img: (await fs.promises.readFile(file.path)).toString('base64'),
          uploadKey: fileKey,
          mimetype: file.mimetype,
          filename,
          expiredTime: addDays(new Date(), 7)
        });
      })
    );

    const { collectionId, insertResults } = await createCollectionAndInsertData({
      dataset,
      imageIds,
      createCollectionParams: {
        parentId,
        teamId,
        tmbId,
        datasetId,
        type: DatasetCollectionTypeEnum.images,
        name: collectionName,
        trainingType: DatasetCollectionDataProcessModeEnum.imageParse
      }
    });

    return {
      collectionId,
      results: insertResults
    };
  } catch (error) {
    return Promise.reject(error);
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
