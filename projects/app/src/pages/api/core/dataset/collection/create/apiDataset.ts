import type { NextApiRequest } from 'next';
import type { ApiDatasetCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import {
  TrainingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CreateCollectionResponse } from '@/global/core/dataset/api';
import { reloadCollectionChunks } from '@fastgpt/service/core/dataset/collection/utils';

async function handler(req: NextApiRequest): CreateCollectionResponse {
  const {
    name,
    text,
    link,
    trainingType = TrainingModeEnum.chunk,
    chunkSize = 512,
    chunkSplitter,
    qaPrompt,
    ...body
  } = req.body as ApiDatasetCreateDatasetCollectionParams;

  if (!text && !link) {
    throw new Error('Text or link is required');
  }

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  const isTextMode = !!text;
  const chunks = isTextMode
    ? splitText2Chunks({
        text,
        chunkLen: chunkSize,
        overlapRatio: trainingType === TrainingModeEnum.chunk ? 0.2 : 0,
        customReg: chunkSplitter ? [chunkSplitter] : []
      }).chunks
    : new Array(10);

  await checkDatasetLimit({
    teamId,
    insertLen: predictDataLimitLength(trainingType, chunks)
  });

  return mongoSessionRun(async (session) => {
    const collection = await createOneCollection({
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.apiFile,
      name: name,
      trainingType,
      chunkSize,
      chunkSplitter,
      qaPrompt,
      ...(isTextMode
        ? { hashRawText: hashStr(text), rawTextLength: text.length }
        : { rawLink: link }),
      session
    });

    const { billId } = await createTrainingUsage({
      teamId,
      tmbId,
      appName: isTextMode ? name : 'core.dataset.collection.Sync Collection',
      billSource: UsageSourceEnum.training,
      vectorModel: getVectorModel(dataset.vectorModel)?.name,
      agentModel: getLLMModel(dataset.agentModel)?.name,
      session
    });

    if (isTextMode) {
      const insertResults = await pushDataListToTrainingQueue({
        teamId,
        tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        agentModel: dataset.agentModel,
        vectorModel: dataset.vectorModel,
        trainingMode: trainingType,
        prompt: qaPrompt,
        billId,
        data: chunks.map((text, index) => ({
          q: text,
          chunkIndex: index
        })),
        session
      });
      return { collectionId: collection._id, results: insertResults };
    }

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
      results: { insertLen: result.insertLen }
    };
  });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default NextAPI(handler);
