import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';

export type Response = {
  id: string;
  q: string;
  a: string;
  imageFileId?: string;
  source: string;
};

async function handler(req: NextApiRequest) {
  const { id: dataId } = req.query as {
    id: string;
  };

  const { datasetData } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: ReadPermissionVal
  });

  return datasetData;
}

export default NextAPI(handler);
