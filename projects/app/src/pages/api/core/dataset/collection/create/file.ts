import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import {
  delFileByFileIdList,
  readFileContentFromMongo
} from '@fastgpt/service/common/file/gridfs/controller';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { FileIdCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { startTrainingQueue } from '@/service/core/dataset/training/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const {
    fileId,
    trainingType = TrainingModeEnum.chunk,
    chunkSize = 512,
    chunkSplitter,
    qaPrompt,
    ...body
  } = req.body as FileIdCreateDatasetCollectionParams;

  try {
    await connectToDatabase();

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: 'w',
      datasetId: body.datasetId
    });

    // 1. read file
    const { rawText, filename } = await readFileContentFromMongo({
      teamId,
      bucketName: BucketNameEnum.dataset,
      fileId
    });
    // 2. split chunks
    const { chunks } = splitText2Chunks({
      text: rawText,
      chunkLen: chunkSize,
      overlapRatio: trainingType === TrainingModeEnum.chunk ? 0.2 : 0,
      customReg: chunkSplitter ? [chunkSplitter] : []
    });

    // 3. auth limit
    await checkDatasetLimit({
      teamId,
      insertLen: predictDataLimitLength(trainingType, chunks)
    });

    await mongoSessionRun(async (session) => {
      // 4. create collection
      const { _id: collectionId } = await createOneCollection({
        ...body,
        teamId,
        tmbId,
        type: DatasetCollectionTypeEnum.file,
        name: filename,
        fileId,
        metadata: {
          relatedImgId: fileId
        },

        // special metadata
        trainingType,
        chunkSize,
        chunkSplitter,
        qaPrompt,

        hashRawText: hashStr(rawText),
        rawTextLength: rawText.length,
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
        prompt: qaPrompt,
        billId,
        data: chunks.map((text, index) => ({
          q: text,
          chunkIndex: index
        })),
        session
      });

      // 7. remove related image ttl
      await MongoImage.updateMany(
        {
          teamId,
          'metadata.relatedId': fileId
        },
        {
          // Remove expiredTime to avoid ttl expiration
          $unset: {
            expiredTime: 1
          }
        },
        {
          session
        }
      );

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
