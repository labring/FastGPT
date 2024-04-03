import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { readFileContentFromMongo } from '@fastgpt/service/common/file/gridfs/controller';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
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
import { parseCsvTable2Chunks } from '@fastgpt/service/core/dataset/training/utils';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { datasetId, parentId, fileId } = req.body as FileIdCreateDatasetCollectionParams;
  const trainingType = TrainingModeEnum.chunk;

  try {
    await connectToDatabase();

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: 'w',
      datasetId: datasetId
    });

    // 1. read file
    const { rawText, filename } = await readFileContentFromMongo({
      teamId,
      bucketName: BucketNameEnum.dataset,
      fileId
    });
    // 2. split chunks
    const { chunks = [] } = parseCsvTable2Chunks(rawText);

    // 3. auth limit
    await checkDatasetLimit({
      teamId,
      insertLen: predictDataLimitLength(trainingType, chunks)
    });

    await mongoSessionRun(async (session) => {
      // 4. create collection
      const { _id: collectionId } = await createOneCollection({
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
      await pushDataListToTrainingQueue({
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

      return collectionId;
    });

    startTrainingQueue(true);

    jsonRes(res);
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
