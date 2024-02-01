/* 
    Create one dataset collection
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { LinkCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import {
  TrainingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/limit/dataset';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { createTrainingBill } from '@fastgpt/service/support/wallet/bill/controller';
import { BillSourceEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { getLLMModel, getVectorModel } from '@/service/core/ai/model';
import { reloadCollectionChunks } from '@fastgpt/service/core/dataset/collection/utils';
import { getStandardSubPlan } from '@/service/support/wallet/sub/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
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
      per: 'w'
    });

    // 1. check dataset limit
    await checkDatasetLimit({
      teamId,
      insertLen: predictDataLimitLength(trainingType, new Array(10)),
      standardPlans: getStandardSubPlan()
    });

    const { _id: collectionId } = await mongoSessionRun(async (session) => {
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
      const { billId } = await createTrainingBill({
        teamId,
        tmbId,
        appName: 'core.dataset.collection.Sync Collection',
        billSource: BillSourceEnum.training,
        vectorModel: getVectorModel(dataset.vectorModel).name,
        agentModel: getLLMModel(dataset.agentModel).name,
        session
      });

      // load
      await reloadCollectionChunks({
        collection: {
          ...collection.toObject(),
          datasetId: dataset
        },
        tmbId,
        billId,
        session
      });

      return collection;
    });

    jsonRes(res, {
      data: { collectionId }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
