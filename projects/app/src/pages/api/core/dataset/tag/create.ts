import type { NextApiRequest } from 'next';
import type { CreateDatasetCollectionTagParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createOneTag } from '@fastgpt/service/core/dataset/tag/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest) {
  const { datasetId, tag } = req.body as CreateDatasetCollectionTagParams;

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: datasetId,
    per: WritePermissionVal
  });

  const { _id } = await createOneTag({
    datasetId,
    teamId,
    tagContent: tag
  });
  return _id;
}

export default NextAPI(handler);
