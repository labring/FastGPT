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
import { getVlmModelList } from '@fastgpt/service/core/ai/model';

async function handler(
  req: ApiRequestProps<
    FileIdCreateDatasetCollectionParams & {
      collectionName: string;
      metadata?: Record<string, any>;
      imageIds?: string[];
    }
  >
): CreateCollectionResponse {
  if (getVlmModelList().length === 0) {
    throw new Error('common.Image dataset requires VLM model to be configured');
  }

  const { imageIds, collectionName, metadata, ...body } = req.body;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId: body.datasetId
  });

  if (!imageIds || imageIds.length === 0) {
    throw new Error('No image IDs provided');
  }

  if (!collectionName) {
    throw new Error('Collection name is required');
  }

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      imageIdList: imageIds,
      trainingType: DatasetCollectionDataProcessModeEnum.imageParse,
      type: DatasetCollectionTypeEnum.image,
      name: collectionName,
      metadata
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
