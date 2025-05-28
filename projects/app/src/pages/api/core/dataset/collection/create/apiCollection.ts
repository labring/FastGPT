import type { NextApiRequest } from 'next';
import type { ApiDatasetCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';
import { readApiServerFileContent } from '@fastgpt/service/core/dataset/read';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

async function handler(req: NextApiRequest): CreateCollectionResponse {
  const { name, apiFileId, customPdfParse, ...body } =
    req.body as ApiDatasetCreateDatasetCollectionParams;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  const apiServer = dataset.apiServer;
  const feishuShareServer = dataset.feishuShareServer;
  const yuqueServer = dataset.yuqueServer;
  const feishuKnowledgeServer = dataset.feishuKnowledgeServer;
  const feishuPrivateServer = dataset.feishuPrivateServer;

  // Auth same apiFileId
  const storeCol = await MongoDatasetCollection.findOne(
    {
      teamId,
      datasetId: dataset._id,
      apiFileId
    },
    '_id'
  ).lean();

  if (storeCol) {
    return Promise.reject(DatasetErrEnum.sameApiCollection);
  }

  const { title, rawText } = await readApiServerFileContent({
    apiServer,
    feishuShareServer,
    feishuKnowledgeServer,
    yuqueServer,
    feishuPrivateServer,
    apiFileId,
    teamId,
    tmbId,
    customPdfParse
  });

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    rawText,
    relatedId: apiFileId,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.apiFile,
      name: title || name,
      apiFileId,
      metadata: {
        relatedImgId: apiFileId
      },
      customPdfParse
    }
  });

  return { collectionId, results: insertResults };
}

export default NextAPI(handler);
