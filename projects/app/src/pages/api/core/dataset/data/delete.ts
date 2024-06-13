import type { NextApiRequest, NextApiResponse } from 'next';
import { authDatasetData } from '@/service/support/permission/auth/dataset';
import { deleteDatasetData } from '@/service/core/dataset/data/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest) {
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
    per: WritePermissionVal
  });

  await deleteDatasetData(datasetData);

  return 'success';
}

export default NextAPI(handler);
