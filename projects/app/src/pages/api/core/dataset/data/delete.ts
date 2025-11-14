import type { NextApiRequest } from 'next';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { deleteDatasetData } from '@/service/core/dataset/data/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
async function handler(req: NextApiRequest) {
  const { id: dataId } = req.query as {
    id: string;
  };

  if (!dataId) {
    Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { datasetData, tmbId, teamId, collection } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: WritePermissionVal
  });

  await deleteDatasetData(datasetData);
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_DATA,
      params: {
        collectionName: collection.name,
        datasetName: collection.dataset?.name || '',
        datasetType: getI18nDatasetType(collection.dataset?.type || '')
      }
    });
  })();
  return 'success';
}

export default NextAPI(handler);
