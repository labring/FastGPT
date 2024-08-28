import type { NextApiRequest } from 'next';
import { readFileContentFromMongo } from '@fastgpt/service/common/file/gridfs/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { FileIdCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { rawText2Chunks } from '@fastgpt/service/core/dataset/read';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { CreateCollectionResponse } from '@/global/core/dataset/api';

async function handler(req: NextApiRequest): CreateCollectionResponse {
  const { datasetId, parentId, fileId, ...body } = req.body as FileIdCreateDatasetCollectionParams;
  const trainingType = TrainingModeEnum.chunk;
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId: datasetId
  });

  // 1. read file
  const { rawText, filename } = await readFileContentFromMongo({
    teamId,
    bucketName: BucketNameEnum.dataset,
    fileId,
    isQAImport: true
  });

  // 2. split chunks
  const chunks = rawText2Chunks({
    rawText,
    isQAImport: true
  });

  // 3. auth limit
  await checkDatasetLimit({
    teamId,
    insertLen: predictDataLimitLength(trainingType, chunks)
  });

  return mongoSessionRun(async (session) => {
    // 4. create collection
    const { _id: collectionId } = await createOneCollection({
      ...body,
      teamId,
      tmbId,
      name: filename,
      parentId,
      datasetId,
      type: DatasetCollectionTypeEnum.file,
      fileId,

      // special metadata
      trainingType,
      chunkSize: 0,

      session
    });

    // 5. create training bill
    const { billId } = await createTrainingUsage({
      teamId,
      tmbId,
      appName: filename,
      billSource: UsageSourceEnum.training,
      vectorModel: getVectorModel(dataset.vectorModel)?.name,
      agentModel: getLLMModel(dataset.agentModel)?.name,
      session
    });

    // 6. insert to training queue
    const insertResult = await pushDataListToTrainingQueue({
      teamId,
      tmbId,
      datasetId: dataset._id,
      collectionId,
      agentModel: dataset.agentModel,
      vectorModel: dataset.vectorModel,
      trainingMode: trainingType,
      billId,
      data: chunks.map((chunk, index) => ({
        q: chunk.q,
        a: chunk.a,
        chunkIndex: index
      })),
      session
    });

    return { collectionId, results: insertResult };
  });
}
export default NextAPI(handler);
