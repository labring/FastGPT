import type { NextApiRequest } from 'next';
import type { CreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest) {
  const body = req.body as CreateDatasetCollectionParams;

  const { teamId, tmbId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  const { _id } = await createOneCollection({
    ...body,
    teamId,
    tmbId
  });
  return _id;
}

export default NextAPI(handler);
