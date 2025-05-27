import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type FileIdCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import {
  createCollectionAndInsertData,
  pushImageFileToTrainingQueue
} from '@fastgpt/service/core/dataset/collection/controller';
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

  const { fileId, fileIds, customPdfParse, collectionName, metadata, ...body } = req.body;

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

  let finalCollectionId = '';
  const allResults = [];

  for (let i = 0; i < imageIds.length; i++) {
    const currentFileId = imageIds[i];

    const imageInfo = await getDatasetImage(currentFileId || '');
    if (!imageInfo) {
      throw new Error(`Image not found: ${currentFileId}`);
    }

    if (String(imageInfo.datasetId) !== String(body.datasetId)) {
      throw new Error(`Image does not belong to current dataset: ${currentFileId}`);
    }

    const finalCollectionName = i === 0 ? collectionName || imageInfo.name : imageInfo.name;
    const finalMetadata = {
      relatedImgId: currentFileId,
      isImageCollection: true,
      contentType: imageInfo.contentType,
      fileSize: imageInfo.size,
      ...(i === 0 ? metadata || {} : {})
    };

    const { collectionId, insertResults } = await createCollectionAndInsertData({
      dataset,
      rawText: '',
      parentCollectionId: i === 0 ? body.parentId : finalCollectionId,
      createCollectionParams: {
        ...body,
        teamId,
        tmbId,
        type: DatasetCollectionTypeEnum.file,
        name: finalCollectionName,
        fileId: currentFileId,
        metadata: finalMetadata,
        customPdfParse
      },
      relatedId: currentFileId
    });

    if (i === 0) {
      finalCollectionId = collectionId;
    }

    await MongoDatasetCollectionImage.updateOne(
      {
        _id: currentFileId,
        teamId: teamId
      },
      {
        $unset: {
          expiredTime: 1
        }
      }
    );

    await pushImageFileToTrainingQueue({
      teamId,
      tmbId,
      datasetId: dataset._id,
      collectionId: finalCollectionId,
      imageFileId: currentFileId || '',
      billId: undefined,
      model: dataset.vlmModel
    });

    allResults.push(insertResults);
  }

  return {
    collectionId: finalCollectionId,
    results: {
      insertLen: allResults.reduce((sum, result) => sum + result.insertLen, 0),
      message:
        allResults
          .map((result) => result.message)
          .filter(Boolean)
          .join('; ') || undefined
    }
  };
}

export default NextAPI(handler);
