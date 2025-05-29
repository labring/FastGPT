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
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';

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

  // Get all image paths before creating collection
  const filePaths: string[] = [];
  for (const imageId of imageIds) {
    const image = await getDatasetImage(imageId);
    if (image?.path) {
      filePaths.push(image.path);
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

  // Delete temporary files after successful import
  if (filePaths.length > 0) {
    removeFilesByPaths(filePaths);
  }

  return {
    collectionId: result.collectionId,
    results: result.insertResults
  };
}

export default NextAPI(handler);
