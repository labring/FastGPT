import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';

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

async function handler(req: NextApiRequest): Promise<getTrainingDataDetailResponse> {
  const { datasetId, dataId } = req.body as getTrainingDataDetailBody;

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });

  const data = await MongoDatasetTraining.findOne({ teamId, datasetId, _id: dataId });

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
