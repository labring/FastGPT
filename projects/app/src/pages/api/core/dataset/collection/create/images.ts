import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type CreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getDatasetImage } from '@fastgpt/service/core/dataset/image/controller';
import { getVlmModelList } from '@fastgpt/service/core/ai/model';

type RequestBody = {
  datasetId: string;
  collectionName: string;
  imageIds: string[];
};

async function handler(req: ApiRequestProps<RequestBody>) {
  if (getVlmModelList().length === 0) {
    throw new Error('Image_dataset_requires_VLM_model_to_be_configured');
  }

  const { imageIds, datasetId, collectionName } = req.body;

  if (!imageIds || imageIds.length === 0) {
    throw new Error('No image IDs provided');
  }

  if (!collectionName) {
    throw new Error('Collection name is required');
  }

  // Verify permissions
  const authData = await authDataset({
    datasetId,
    per: WritePermissionVal,
    req,
    authToken: true
  });

  // Verify all images exist and belong to the dataset
  for (const imageId of imageIds) {
    const image = await getDatasetImage(imageId);
    if (!image) {
      throw new Error('Dataset_ID_not_found');
    }
    if (String(image.teamId) !== String(authData.teamId)) {
      throw new Error('Image_does_not_belong_to_current_team');
    }
  }

  // Create collection
  const result = await createCollectionAndInsertData({
    dataset: authData.dataset,
    createCollectionParams: {
      teamId: authData.teamId,
      tmbId: authData.tmbId,
      datasetId,
      name: collectionName,
      type: DatasetCollectionTypeEnum.images,
      trainingType: DatasetCollectionDataProcessModeEnum.imageParse,
      imageIdList: imageIds
    }
  });

  return {
    collectionId: result.collectionId,
    results: result.insertResults
  };
}

export default NextAPI(handler);
