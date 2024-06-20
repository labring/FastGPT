import type { NextApiRequest } from 'next';
import { updateData2Dataset } from '@/service/core/dataset/data/controller';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { UpdateDatasetDataProps } from '@/global/core/dataset/api';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';

async function handler(req: NextApiRequest) {
  const { id, q = '', a, indexes = [] } = req.body as UpdateDatasetDataProps;

  // auth data permission
  const {
    collection: {
      datasetId: { vectorModel }
    },
    teamId,
    tmbId
  } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId: id,
    per: WritePermissionVal
  });

  // auth team balance
  await checkDatasetLimit({
    teamId,
    insertLen: 1
  });

  const { tokens } = await updateData2Dataset({
    dataId: id,
    q,
    a,
    indexes,
    model: vectorModel
  });

  pushGenerateVectorUsage({
    teamId,
    tmbId,
    tokens,
    model: vectorModel
  });
}

export default NextAPI(handler);
