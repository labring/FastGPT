import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authDatasetData } from '@/service/support/permission/auth/dataset';
import { deleteDatasetData } from '@/service/core/dataset/data/controller';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { id: dataId } = req.query as {
    id: string;
  };

  if (!dataId) {
    throw new Error('dataId is required');
  }

  // 凭证校验
  const { teamId, datasetData } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: 'w'
  });

  await deleteDatasetData(datasetData);

  jsonRes(res, {
    data: 'success'
  });
}

export default NextAPI(handler);
