import type { NextApiRequest } from 'next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { deleteDatasets } from '@fastgpt/service/core/dataset/controller';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import { NextAPI } from '@/service/middleware/entry';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';

async function handler(req: NextApiRequest) {
  const { id: datasetId } = req.query as {
    id: string;
  };

  if (!datasetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // auth owner
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });

  const datasets = await findDatasetAndAllChildren({
    teamId,
    datasetId
  });

  await deleteDatasets({
    teamId,
    datasets
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_DATASET,
      params: {
        datasetName: dataset.name,
        datasetType: getI18nDatasetType(dataset.type)
      }
    });
  })();
}

export default NextAPI(handler);
