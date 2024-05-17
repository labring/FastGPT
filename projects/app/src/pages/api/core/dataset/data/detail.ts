import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authDatasetData } from '@/service/support/permission/auth/dataset';
import { NextAPI } from '@/service/middleware/entry';

export type Response = {
  id: string;
  q: string;
  a: string;
  source: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { id: dataId } = req.query as {
    id: string;
  };

  // 凭证校验
  const { datasetData } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: 'r'
  });

  jsonRes(res, {
    data: datasetData
  });
}

export default NextAPI(handler);
