/* 
    Create one dataset collection
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { TextCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import {
  TrainingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/limit/dataset';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataToTrainingQueue } from '@/service/core/dataset/data/controller';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { createTrainingBill } from '@fastgpt/service/support/wallet/bill/controller';
import { BillSourceEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { getLLMModel, getVectorModel } from '@/service/core/ai/model';
import { getStandardSubPlan } from '@/service/support/wallet/sub/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
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
      per: 'w'
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
      insertLen: predictDataLimitLength(trainingType, chunks),
      standardPlans: getStandardSubPlan()
    });

    // 3. create collection and training bill
    const [{ _id: collectionId }, { billId }] = await Promise.all([
      createOneCollection({
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
        rawTextLength: text.length
      }),
      createTrainingBill({
        teamId,
        tmbId,
        appName: name,
        billSource: BillSourceEnum.training,
        vectorModel: getVectorModel(dataset.vectorModel)?.name,
        agentModel: getLLMModel(dataset.agentModel)?.name
      })
    ]);

    // 4. push chunks to training queue
    const insertResults = await pushDataToTrainingQueue({
      teamId,
      tmbId,
      collectionId,
      trainingMode: trainingType,
      prompt: qaPrompt,
      billId,
      data: chunks.map((text, index) => ({
        q: text,
        chunkIndex: index
      }))
    });

    jsonRes(res, {
      data: { collectionId, results: insertResults }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};
