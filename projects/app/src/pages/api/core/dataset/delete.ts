import type { NextApiRequest } from 'next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { delDatasetRelevantData } from '@fastgpt/service/core/dataset/controller';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { NextAPI } from '@/service/middleware/entry';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(req: NextApiRequest) {
  const { id: datasetId } = req.query as {
    id: string;
  };

  if (!datasetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // auth owner
  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });

  const datasets = await findDatasetAndAllChildren({
    teamId,
    datasetId
  });

  // delete all dataset.data and pg data
  await mongoSessionRun(async (session) => {
    // delete dataset data
    await delDatasetRelevantData({ datasets, session });
    await MongoDataset.deleteMany(
      {
        _id: { $in: datasets.map((d) => d._id) }
      },
      { session }
    );
  });
}

export default NextAPI(handler);
