import type { NextApiRequest } from 'next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { checkExportDatasetLimit } from '@fastgpt/service/support/user/utils';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';

async function handler(req: NextApiRequest) {
  const { datasetId } = req.query as {
    datasetId: string;
  };

  if (!datasetId) {
    throw new Error('datasetId is required');
  }

  // 凭证校验
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: WritePermissionVal
  });

  await checkExportDatasetLimit({
    teamId,
    limitMinutes: global.feConfigs?.limit?.exportDatasetLimitMinutes
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.EXPORT_DATASET,
      params: {
        datasetName: dataset.name,
        datasetType: getI18nDatasetType(dataset.type)
      }
    });
  })();
}

export default NextAPI(handler);
