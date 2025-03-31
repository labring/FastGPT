import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';

export type getTrainingDataDetailQuery = {};

export type getTrainingDataDetailBody = {
  datasetId: string;
  dataId: string;
};

export type getTrainingDataDetailResponse =
  | {
      _id: string;
      datasetId: string;
      mode: string;
      q: string;
      a: string;
    }
  | undefined;

async function handler(
  req: ApiRequestProps<getTrainingDataDetailBody, getTrainingDataDetailQuery>
): Promise<getTrainingDataDetailResponse> {
  const { datasetId, dataId } = req.body;

  const { teamId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: dataId,
    per: ReadPermissionVal
  });

  const data = await MongoDatasetTraining.findOne({ teamId, datasetId, _id: dataId }).lean();

  if (!data) {
    return undefined;
  }

  return {
    _id: data._id,
    datasetId: data.datasetId,
    mode: data.mode,
    q: data.q,
    a: data.a
  };
}

export default NextAPI(handler);
