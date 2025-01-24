import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';

export type GetQuoteDataResponse = {
  collection: CollectionWithDatasetType;
  q: string;
  a: string;
};

async function handler(req: NextApiRequest): Promise<GetQuoteDataResponse> {
  const { id: dataId } = req.query as {
    id: string;
  };

  // 凭证校验
  const { datasetData, collection } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: ReadPermissionVal
  });

  return {
    collection,
    q: datasetData.q,
    a: datasetData.a
  };
}

export default NextAPI(handler);
