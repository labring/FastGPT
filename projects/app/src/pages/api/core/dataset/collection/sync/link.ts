import type { NextApiRequest } from 'next';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import {
  getCollectionAndRawText,
  reloadCollectionChunks
} from '@fastgpt/service/core/dataset/collection/utils';
import { delCollectionAndRelatedSources } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionSyncResultEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(req: NextApiRequest) {
  const { collectionId } = req.body as { collectionId: string };

  if (!collectionId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { collection, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    collectionId,
    per: WritePermissionVal
  });

  if (collection.type !== DatasetCollectionTypeEnum.link || !collection.rawLink) {
    return Promise.reject(DatasetErrEnum.unLinkCollection);
  }

  const { title, rawText, isSameRawText } = await getCollectionAndRawText({
    collection
  });

  if (isSameRawText) {
    return DatasetCollectionSyncResultEnum.sameRaw;
  }

  /* Not the same original text, create and reload */

  const vectorModelData = getVectorModel(collection.datasetId.vectorModel);
  const agentModelData = getLLMModel(collection.datasetId.agentModel);

  await mongoSessionRun(async (session) => {
    // create training bill
    const { billId } = await createTrainingUsage({
      teamId: collection.teamId,
      tmbId,
      appName: 'core.dataset.collection.Sync Collection',
      billSource: UsageSourceEnum.training,
      vectorModel: vectorModelData.name,
      agentModel: agentModelData.name,
      session
    });

    // create a collection and delete old
    const newCol = await createOneCollection({
      teamId: collection.teamId,
      tmbId: collection.tmbId,
      parentId: collection.parentId,
      datasetId: collection.datasetId._id,
      name: title || collection.name,
      type: collection.type,
      trainingType: collection.trainingType,
      chunkSize: collection.chunkSize,
      chunkSplitter: collection.chunkSplitter,
      qaPrompt: collection.qaPrompt,
      fileId: collection.fileId,
      rawLink: collection.rawLink,
      metadata: collection.metadata,
      createTime: collection.createTime,
      session
    });

    // start load
    await reloadCollectionChunks({
      collection: {
        ...newCol.toObject(),
        datasetId: collection.datasetId
      },
      tmbId,
      billId,
      rawText,
      session
    });

    // delete old collection
    await delCollectionAndRelatedSources({
      collections: [collection],
      session
    });
  });

  return DatasetCollectionSyncResultEnum.success;
}

export default NextAPI(handler);
