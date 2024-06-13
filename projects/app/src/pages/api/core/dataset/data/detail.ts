import type { NextApiRequest } from 'next';
import { authDatasetData } from '@/service/support/permission/auth/dataset';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

export type Response = {
  id: string;
  q: string;
  a: string;
  source: string;
};

async function handler(req: NextApiRequest) {
  const { id: dataId } = req.query as {
    id: string;
  };

  // 凭证校验
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
