import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteOneTag } from '@fastgpt/service/core/dataset/tag/controller';

async function handler(req: NextApiRequest) {
  const { id: tagId, datasetId } = req.query as { id: string; datasetId: string };

  if (!tagId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });

  await deleteOneTag({
    tagId,
    datasetId,
    teamId
  });
}

export default NextAPI(handler);
