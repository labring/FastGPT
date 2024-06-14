import type { NextApiRequest } from 'next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { checkExportDatasetLimit } from '@fastgpt/service/support/user/utils';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest) {
  const { datasetId } = req.query as {
    datasetId: string;
  };

  if (!datasetId) {
    throw new Error('datasetId is required');
  }

  // 凭证校验
  const { teamId } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: WritePermissionVal
  });

  await checkExportDatasetLimit({
    teamId,
    limitMinutes: global.feConfigs?.limit?.exportDatasetLimitMinutes
  });
}

export default NextAPI(handler);
