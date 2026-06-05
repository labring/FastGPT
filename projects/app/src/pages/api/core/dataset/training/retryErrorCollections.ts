import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  RetryErrorCollectionsBodySchema,
  type RetryErrorCollectionsResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';

async function handler(req: ApiRequestProps): Promise<RetryErrorCollectionsResponse> {
  const { datasetId, collectionIds } = RetryErrorCollectionsBodySchema.parse(req.body);

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  await MongoDatasetTraining.updateMany(
    {
      teamId,
      datasetId,
      ...(collectionIds ? { collectionId: { $in: collectionIds } } : {}),
      errorMsg: { $exists: true, $ne: null }
    },
    {
      $unset: { errorMsg: '' },
      $set: { retryCount: 5, lockTime: new Date('2000') }
    }
  );

  return {};
}

export default NextAPI(handler);

export { handler };
