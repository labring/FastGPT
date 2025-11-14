import { updateData2Dataset } from '@/service/core/dataset/data/controller';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { type UpdateDatasetDataProps } from '@fastgpt/global/core/dataset/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';

async function handler(req: ApiRequestProps<UpdateDatasetDataProps>) {
  const { dataId, q, a, indexes = [] } = req.body;

  // auth data permission
  const {
    collection: {
      dataset: { vectorModel },
      name,
      indexPrefixTitle
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
      model: vectorModel,
      indexPrefix: indexPrefixTitle ? `# ${name}` : undefined
    });

    pushGenerateVectorUsage({
      teamId,
      tmbId,
      inputTokens: tokens,
      model: vectorModel
    });

    (() => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.UPDATE_DATA,
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
