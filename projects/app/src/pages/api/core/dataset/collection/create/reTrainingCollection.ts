import { readFileContentFromMongo } from '@fastgpt/service/common/file/gridfs/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { reTrainingDatasetFileCollectionParams } from '@fastgpt/global/core/dataset/api';
import {
  createCollectionAndInsertData,
  createOneCollection
} from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetSourceReadTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { MongoRawTextBuffer } from '@fastgpt/service/common/buffer/rawText/schema';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delOnlyCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

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

  const fileId = collection?.fileId;
  const link = collection?.rawLink;

  let type: DatasetSourceReadTypeEnum;
  if (fileId) {
    type = DatasetSourceReadTypeEnum.fileLocal;
  } else {
    type = DatasetSourceReadTypeEnum.link;
  }

  const rawText = await readDatasetSourceRawText({
    teamId: collection.teamId,
    type: type,
    sourceId: fileId || link || ''
  });

  const filename = collection.name;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId: body.datasetId
  });

  const result = await createCollectionAndInsertData({
    dataset,
    rawText,
    createCollectionParams: {
      ...body,
      teamId: collection.teamId,
      tmbId,
      type: fileId ? DatasetCollectionTypeEnum.file : DatasetCollectionTypeEnum.link,
      name: filename,
      fileId,
      metadata: {
        relatedImgId: fileId
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

  // find all delete id

  const collections = await findCollectionAndChild({
    teamId,
    datasetId: collection.datasetId._id,
    collectionId,
    fields: '_id teamId datasetId fileId metadata'
  });

  // delete
  await mongoSessionRun((session) =>
    delOnlyCollection({
      collections,
      session
    })
  );
}

export default NextAPI(handler);
