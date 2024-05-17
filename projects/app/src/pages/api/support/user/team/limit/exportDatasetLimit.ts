import type { NextApiRequest, NextApiResponse } from 'next';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { checkExportDatasetLimit } from '@fastgpt/service/support/user/utils';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { datasetId } = req.query as {
    datasetId: string;
  };

  if (!datasetId) {
    throw new Error('datasetId is required');
  }

  // 凭证校验
  const { teamId } = await authDataset({ req, authToken: true, datasetId, per: 'w' });

  await checkExportDatasetLimit({
    teamId,
    limitMinutes: global.feConfigs?.limit?.exportDatasetLimitMinutes
  });
}

export default NextAPI(handler);
