import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type FileIdCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import {
  createCollectionAndInsertData,
  pushImageFileToTrainingQueue
} from '@fastgpt/service/core/dataset/collection/controller_imageFileId';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';
import { getDatasetImage } from '@fastgpt/service/core/dataset/controller';
import { MongoDatasetCollectionImage } from '@fastgpt/service/core/dataset/schema';
import { hasAvailableVlmModel } from '@fastgpt/service/core/ai/model';
import { t } from 'i18next';

async function handler(
  req: ApiRequestProps<FileIdCreateDatasetCollectionParams>
): CreateCollectionResponse {
  // Check if VLM model is available for image datasets
  if (!hasAvailableVlmModel()) {
    throw new Error(t('file:common.Image dataset requires VLM model to be configured'));
  }

  const { fileId, customPdfParse, ...body } = req.body;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId: body.datasetId
  });

  // Get image info
  const imageInfo = await getDatasetImage(fileId || '');
  if (!imageInfo) {
    throw new Error('Image not found');
  }

  // Verify image belongs to current dataset
  if (String(imageInfo.datasetId) !== String(body.datasetId)) {
    throw new Error('Image does not belong to current dataset');
  }

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    rawText: '',
    collectionId: body.parentId,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.file,
      name: imageInfo.name,
      fileId,
      metadata: {
        relatedImgId: fileId,
        isImageCollection: true,
        contentType: imageInfo.contentType,
        fileSize: imageInfo.size
      },
      customPdfParse
    },
    relatedId: fileId
  });

  // Remove image TTL to prevent expiration during training
  await MongoDatasetCollectionImage.updateOne(
    {
      _id: fileId,
      teamId: teamId
    },
    {
      $unset: {
        expiredTime: 1
      }
    }
  );

  // Push image training task
  await pushImageFileToTrainingQueue({
    teamId,
    tmbId,
    datasetId: dataset._id,
    collectionId: collectionId || '',
    imageFileId: fileId || '',
    billId: undefined,
    model: dataset.vlmModel
  });

  return {
    collectionId: collectionId || '',
    results: insertResults
  };
}

export default NextAPI(handler);
