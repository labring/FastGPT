import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { checkExportDatasetLimit } from '@fastgpt/service/support/user/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
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

    jsonRes(res);
  } catch (err) {
    res.status(500);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
