import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
async function handler(req: NextApiRequest) {
  const { datasetId, dataId } = req.body;

  if (!datasetId || !dataId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });

  await MongoDatasetTraining.deleteOne({
    teamId,
    datasetId,
    _id: dataId
  });

  return {};
}

export default NextAPI(handler);
