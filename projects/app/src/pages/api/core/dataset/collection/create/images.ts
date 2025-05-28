import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type FileIdCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';
import { getDatasetImage } from '@fastgpt/service/core/dataset/image/controller';
import { hasAvailableVlmModel } from '@fastgpt/service/core/ai/model';
import { t } from 'i18next';

async function handler(
  req: ApiRequestProps<
    FileIdCreateDatasetCollectionParams & {
      collectionName?: string;
      metadata?: Record<string, any>;
      fileIds?: string[];
    }
  >
): CreateCollectionResponse {
  if (!hasAvailableVlmModel()) {
    throw new Error(t('file:common.Image dataset requires VLM model to be configured'));
  }

  const { fileId, fileIds, collectionName, metadata, ...body } = req.body;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId: body.datasetId
  });

  const imageIds = fileIds && fileIds.length > 0 ? fileIds : [fileId];
  if (!imageIds || imageIds.length === 0) {
    throw new Error('No image IDs provided');
  }

  // Validate all images exist and belong to the dataset
  for (const currentFileId of imageIds) {
    const imageInfo = await getDatasetImage(currentFileId || '');
    if (!imageInfo) {
      throw new Error(`Image not found: ${currentFileId}`);
    }

    if (String(imageInfo.datasetId) !== String(body.datasetId)) {
      throw new Error(`Image does not belong to current dataset: ${currentFileId}`);
    }
  }

  // Create collection with all images at once
  const finalCollectionName =
    collectionName ||
    `Image Collection ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '_')}`;
  const finalMetadata = {
    imageCount: imageIds.length,
    imageIdList: imageIds,
    ...(metadata || {})
  };

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      trainingType: DatasetCollectionDataProcessModeEnum.imageParse,
      type: DatasetCollectionTypeEnum.file,
      name: finalCollectionName,
      metadata: finalMetadata
    }
  });

  return {
    collectionId: collectionId,
    results: {
      insertLen: insertResults.insertLen,
      message: insertResults.message
    }
  };
}

export default NextAPI(handler);
