import type { NextApiRequest } from 'next';
import type { TextCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CreateCollectionResponse } from '@/global/core/dataset/api';

async function handler(req: NextApiRequest): CreateCollectionResponse {
  const { name, text, ...body } = req.body as TextCreateDatasetCollectionParams;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    rawText: text,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.virtual,

      name
    }
  });

  return {
    collectionId,
    results: insertResults
  };
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default NextAPI(handler);
