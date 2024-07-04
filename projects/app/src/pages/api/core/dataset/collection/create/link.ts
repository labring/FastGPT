import type { NextApiRequest } from 'next';
import type { LinkCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import {
  TrainingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { reloadCollectionChunks } from '@fastgpt/service/core/dataset/collection/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CreateCollectionResponse } from '@/global/core/dataset/api';

async function handler(req: NextApiRequest): CreateCollectionResponse {
  const {
    link,
    trainingType = TrainingModeEnum.chunk,
    chunkSize = 512,
    chunkSplitter,
    qaPrompt,
    ...body
  } = req.body as LinkCreateDatasetCollectionParams;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  // 1. check dataset limit
  await checkDatasetLimit({
    teamId,
    insertLen: predictDataLimitLength(trainingType, new Array(10))
  });

  return mongoSessionRun(async (session) => {
    // 2. create collection
    const collection = await createOneCollection({
      ...body,
      name: link,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.link,

      trainingType,
      chunkSize,
      chunkSplitter,
      qaPrompt,

      rawLink: link,
      session
    });

    // 3. create bill and start sync
    const { billId } = await createTrainingUsage({
      teamId,
      tmbId,
      appName: 'core.dataset.collection.Sync Collection',
      billSource: UsageSourceEnum.training,
      vectorModel: getVectorModel(dataset.vectorModel).name,
      agentModel: getLLMModel(dataset.agentModel).name,
      session
    });

    // load
    const result = await reloadCollectionChunks({
      collection: {
        ...collection.toObject(),
        datasetId: dataset
      },
      tmbId,
      billId,
      session
    });

    return {
      collectionId: collection._id,
      results: {
        insertLen: result.insertLen
      }
    };
  });
}

export default NextAPI(handler);
