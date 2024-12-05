import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { reTrainingDatasetFileCollectionParams } from '@fastgpt/global/core/dataset/api';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetSourceReadTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delOnlyCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';

// 获取集合并处理
async function handler(req: ApiRequestProps<reTrainingDatasetFileCollectionParams>) {
  const {
    collectionId,
    trainingType = TrainingModeEnum.chunk,
    chunkSize = 512,
    chunkSplitter,
    qaPrompt,
    ...body
  } = req.body;

  if (!collectionId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: collectionId,
    per: ReadPermissionVal
  });

  const fileId = collection.fileId;
  const link = collection.rawLink;

  const type = fileId ? DatasetSourceReadTypeEnum.fileLocal : DatasetSourceReadTypeEnum.link;

  const rawText = await readDatasetSourceRawText({
    teamId: collection.teamId,
    type: type,
    sourceId: fileId || link || ''
  });

  await createCollectionAndInsertData({
    dataset: collection.datasetId,
    rawText,
    createCollectionParams: {
      ...body,
      teamId: collection.teamId,
      tmbId: collection.tmbId,
      type: fileId ? DatasetCollectionTypeEnum.file : DatasetCollectionTypeEnum.link,
      name: collection.name,
      fileId: collection.fileId,
      metadata: {
        relatedImgId: collection.fileId
      },

      // special metadata
      trainingType,
      chunkSize,
      chunkSplitter,
      qaPrompt,

      hashRawText: hashStr(rawText),
      rawTextLength: rawText.length,
      ...(fileId ? {} : { rawLink: collection.rawLink })
    },

    relatedId: fileId
  });

  const collections: CollectionWithDatasetType[] = [collection];

  // delete
  await mongoSessionRun((session) =>
    delOnlyCollection({
      collections,
      session
    })
  );
}

export default NextAPI(handler);
