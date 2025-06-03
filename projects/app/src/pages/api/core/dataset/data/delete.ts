import type { NextApiRequest } from 'next';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { deleteDatasetData } from '@/service/core/dataset/data/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/operationLog/util';
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
    addOperationLog({
      tmbId,
      teamId,
      event: OperationLogEventEnum.DELETE_DATA,
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
