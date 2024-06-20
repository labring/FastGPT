import type { NextApiRequest } from 'next';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { deleteDatasetData } from '@/service/core/dataset/data/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(req: NextApiRequest) {
  const { id: dataId } = req.query as {
    id: string;
  };

  if (!dataId) {
    Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { datasetData } = await authDatasetData({
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
