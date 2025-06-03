import { updateData2Dataset } from '@/service/core/dataset/data/controller';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { type UpdateDatasetDataProps } from '@fastgpt/global/core/dataset/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/operationLog/util';
async function handler(req: ApiRequestProps<UpdateDatasetDataProps>) {
  const { dataId, q, a, indexes = [] } = req.body;

  // auth data permission
  const {
    collection: {
      dataset: { vectorModel }
    },
    teamId,
    tmbId,
    collection
  } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: WritePermissionVal
  });

  if (q || a || indexes.length > 0) {
    const { tokens } = await updateData2Dataset({
      dataId,
      q,
      a,
      indexes,
      model: vectorModel
    });

    pushGenerateVectorUsage({
      teamId,
      tmbId,
      inputTokens: tokens,
      model: vectorModel
    });

    (() => {
      addOperationLog({
        tmbId,
        teamId,
        event: OperationLogEventEnum.UPDATE_DATA,
        params: {
          collectionName: collection.name,
          datasetName: collection.dataset?.name || '',
          datasetType: getI18nDatasetType(collection.dataset?.type || '')
        }
      });
    })();
  }
}

export default NextAPI(handler);
