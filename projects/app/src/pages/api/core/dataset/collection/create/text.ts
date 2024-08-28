import type { NextApiRequest } from 'next';
import type { TextCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
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

async function handler(req: NextApiRequest): CreateCollectionResponse {
  const {
    name,
    text,
    trainingType = TrainingModeEnum.chunk,
    chunkSize = 512,
    chunkSplitter,
    qaPrompt,
    ...body
  } = req.body as TextCreateDatasetCollectionParams;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  // 1. split text to chunks
  const { chunks } = splitText2Chunks({
    text,
    chunkLen: chunkSize,
    overlapRatio: trainingType === TrainingModeEnum.chunk ? 0.2 : 0,
    customReg: chunkSplitter ? [chunkSplitter] : []
  });

  // 2. check dataset limit
  await checkDatasetLimit({
    teamId,
    insertLen: predictDataLimitLength(trainingType, chunks)
  });

  const createResult = await mongoSessionRun(async (session) => {
    // 3. create collection
    const { _id: collectionId } = await createOneCollection({
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.virtual,

      name,
      trainingType,
      chunkSize,
      chunkSplitter,
      qaPrompt,

      hashRawText: hashStr(text),
      rawTextLength: text.length,
      session
    });

    // 4. create training bill
    const { billId } = await createTrainingUsage({
      teamId,
      tmbId,
      appName: name,
      billSource: UsageSourceEnum.training,
      vectorModel: getVectorModel(dataset.vectorModel)?.name,
      agentModel: getLLMModel(dataset.agentModel)?.name,
      session
    });

    // 5. push chunks to training queue
    const insertResults = await pushDataListToTrainingQueue({
      teamId,
      tmbId,
      datasetId: dataset._id,
      collectionId,
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

    return { collectionId, results: insertResults };
  });

  return createResult;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default NextAPI(handler);
