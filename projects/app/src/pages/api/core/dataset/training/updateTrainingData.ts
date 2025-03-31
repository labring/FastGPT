import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { addMinutes } from 'date-fns';

export type updateTrainingDataBody = {
  datasetId: string;
  dataId: string;
  q?: string;
  a?: string;
};

export type updateTrainingDataQuery = {};

export type updateTrainingDataResponse = {};

async function handler(
  req: ApiRequestProps<updateTrainingDataBody, updateTrainingDataQuery>
): Promise<updateTrainingDataResponse> {
  const { datasetId, dataId, q, a } = req.body;

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });

  const data = await MongoDatasetTraining.findOne({ teamId, datasetId, _id: dataId });

  if (!data) {
    return Promise.reject('data not found');
  }

  await MongoDatasetTraining.updateOne(
    {
      teamId,
      datasetId,
      _id: dataId
    },
    {
      retryCount: 3,
      ...(q !== undefined && { q }),
      ...(a !== undefined && { a }),
      lockTime: addMinutes(new Date(), -10),
      errorMsg: ''
    }
  );

  return {};
}

export default NextAPI(handler);
