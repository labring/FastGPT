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
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { MongoRawTextBuffer } from '@fastgpt/service/common/buffer/rawText/schema';
import { rawText2Chunks } from '@fastgpt/service/core/dataset/read';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: ApiRequestProps<FileIdCreateDatasetCollectionParams>) {
  const {
    fileId,
    trainingType = TrainingModeEnum.chunk,
    chunkSize = 512,
    chunkSplitter,
    qaPrompt,
    ...body
  } = req.body;

  const start = Date.now();
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId: body.datasetId
  });

  // 1. read file
  const { rawText, filename } = await readFileContentFromMongo({
    teamId,
    bucketName: BucketNameEnum.dataset,
    fileId
  });

  // 2. split chunks
  const chunks = rawText2Chunks({
    rawText,
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
      data: chunks.map((item, index) => ({
        ...item,
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

    // remove buffer
    await MongoRawTextBuffer.deleteOne({ sourceId: fileId });
    return collectionId;
  });
}

export default NextAPI(handler);
