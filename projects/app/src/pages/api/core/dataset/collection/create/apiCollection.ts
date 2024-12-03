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
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CreateCollectionResponse } from '@/global/core/dataset/api';
import { readApiServerFileContent } from '@fastgpt/service/core/dataset/read';

async function handler(req: NextApiRequest): CreateCollectionResponse {
  const {
    name,
    apiFileId,
    trainingType = TrainingModeEnum.chunk,
    chunkSize = 512,
    chunkSplitter,
    qaPrompt,
    ...body
  } = req.body as ApiDatasetCreateDatasetCollectionParams;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  const { apiServer } = dataset;
  if (!apiServer) {
    return Promise.reject('Api server not found');
  }
  if (!apiFileId) {
    return Promise.reject('ApiFileId not found');
  }

  const content = await readApiServerFileContent({
    apiServer,
    apiFileId,
    teamId
  });

  const { chunks } = splitText2Chunks({
    text: content,
    chunkLen: chunkSize,
    overlapRatio: trainingType === TrainingModeEnum.chunk ? 0.2 : 0,
    customReg: chunkSplitter ? [chunkSplitter] : []
  });

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
      apiFileId,
      session
    });

    const { billId } = await createTrainingUsage({
      teamId,
      tmbId,
      appName: name,
      billSource: UsageSourceEnum.training,
      vectorModel: getVectorModel(dataset.vectorModel)?.name,
      agentModel: getLLMModel(dataset.agentModel)?.name,
      session
    });

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
