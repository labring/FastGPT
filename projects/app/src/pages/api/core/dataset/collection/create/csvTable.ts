import type { NextApiRequest } from 'next';
import { readFileContentFromMongo } from '@fastgpt/service/common/file/gridfs/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { FileIdCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { CreateCollectionResponse } from '@/global/core/dataset/api';
import { MongoRawTextBuffer } from '@fastgpt/service/common/buffer/rawText/schema';

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

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    rawText,
    isQAImport: true,
    createCollectionParams: {
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
      chunkSize: 0
    }
  });

  // remove buffer
  await MongoRawTextBuffer.deleteOne({ sourceId: fileId });

  return { collectionId, results: insertResults };
}
export default NextAPI(handler);
