import type { NextApiRequest } from 'next';
import type { ApiDatasetCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  TrainingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';

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

  const apiServer = dataset.apiServer;
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

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    rawText: content,
    relatedId: apiFileId,
    createCollectionParams: {
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
      metadata: {
        relatedImgId: apiFileId
      }
    }
  });

  return { collectionId, results: insertResults };
}

export default NextAPI(handler);
