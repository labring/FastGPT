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
import { delOnlyCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { i18nT } from '@fastgpt/web/i18n/utils';

type RetrainingCollectionResponse = {
  collectionId: string;
};

// 获取集合并处理
async function handler(
  req: ApiRequestProps<reTrainingDatasetFileCollectionParams>
): Promise<RetrainingCollectionResponse> {
  const {
    collectionId,
    trainingType = TrainingModeEnum.chunk,
    chunkSize = 512,
    chunkSplitter,
    qaPrompt
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

  const sourceReadType = await (async () => {
    if (collection.type === DatasetCollectionTypeEnum.link) {
      if (!collection.rawLink) return Promise.reject('rawLink is missing');
      return {
        type: DatasetSourceReadTypeEnum.link,
        sourceId: collection.rawLink,
        selector: collection.metadata?.webPageSelector
      };
    }
    if (collection.type === DatasetCollectionTypeEnum.file) {
      if (!collection.fileId) return Promise.reject('fileId is missing');
      return {
        type: DatasetSourceReadTypeEnum.fileLocal,
        sourceId: collection.fileId
      };
    }
    if (collection.type === DatasetCollectionTypeEnum.apiFile) {
      if (!collection.apiFileId) return Promise.reject('apiFileId is missing');
      return {
        type: DatasetSourceReadTypeEnum.apiFile,
        sourceId: collection.apiFileId,
        apiServer: collection.datasetId.apiServer
      };
    }
    if (collection.type === DatasetCollectionTypeEnum.externalFile) {
      if (!collection.externalFileUrl) return Promise.reject('externalFileId is missing');
      return {
        type: DatasetSourceReadTypeEnum.externalFile,
        sourceId: collection.externalFileUrl,
        externalFileId: collection.externalFileId
      };
    }

    return Promise.reject(i18nT('dataset:collection_not_support_retraining'));
  })();

  const rawText = await readDatasetSourceRawText({
    teamId: collection.teamId,
    ...sourceReadType
  });

  return mongoSessionRun(async (session) => {
    const { collectionId } = await createCollectionAndInsertData({
      dataset: collection.datasetId,
      rawText,
      createCollectionParams: {
        teamId: collection.teamId,
        tmbId: collection.tmbId,
        datasetId: collection.datasetId._id,
        name: collection.name,
        type: collection.type,

        fileId: collection.fileId,
        rawLink: collection.rawLink,
        externalFileId: collection.externalFileId,
        externalFileUrl: collection.externalFileUrl,
        apiFileId: collection.apiFileId,

        hashRawText: hashStr(rawText),
        rawTextLength: rawText.length,

        tags: collection.tags,
        createTime: collection.createTime,

        parentId: collection.parentId,

        // special metadata
        trainingType,
        chunkSize,
        chunkSplitter,
        qaPrompt,
        metadata: collection.metadata
      }
    });
    await delOnlyCollection({
      collections: [collection],
      session
    });

    return { collectionId };
  });
}

export default NextAPI(handler);
