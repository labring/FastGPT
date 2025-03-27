import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';

export type deleteTrainingDataBody = {
  datasetId: string;
  dataId: string;
};

async function handler(req: NextApiRequest) {
  const { datasetId, dataId } = req.body as deleteTrainingDataBody;

  if (!datasetId || !dataId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { teamId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: dataId,
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
