import type { NextApiRequest } from 'next';
import type { UpdateDatasetCollectionTagParams } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { updateOneTag } from '@fastgpt/service/core/dataset/tag/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest) {
  const { datasetId, tag, tagId } = req.body as UpdateDatasetCollectionTagParams;

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: datasetId,
    per: WritePermissionVal
  });

  await updateOneTag({
    datasetId,
    teamId,
    tagId,
    tagContent: tag
  });
}

export default NextAPI(handler);
