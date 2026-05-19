import {
  updateDatasetDataByIndexes,
  updateDatasetDataDefaultIndexes
} from '@/service/core/dataset/data/data';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import {
  UpdateDatasetDataBodySchema,
  UpdateDatasetDataResponseSchema,
  type UpdateDatasetDataResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';

async function handler(req: ApiRequestProps): Promise<UpdateDatasetDataResponse> {
  const { dataId, q, a, indexes } = UpdateDatasetDataBodySchema.parse(req.body);
  const hasIndexes = Object.hasOwn(req.body, 'indexes');

  // auth data permission
  const {
    collection: {
      dataset: { vectorModel },
      name,
      indexPrefixTitle
    },
    teamId,
    tmbId,
    collection,
    datasetData
  } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: WritePermissionVal
  });

  if (hasIndexes) {
    const { tokens } = await updateDatasetDataByIndexes({
      dataId,
      q,
      a,
      indexes: indexes ?? [],
      model: vectorModel,
      indexPrefix: indexPrefixTitle ? `# ${name}` : undefined
    });

    if (tokens > 0) {
      pushGenerateVectorUsage({
        teamId,
        tmbId,
        inputTokens: tokens,
        model: vectorModel
      });
    }
  } else {
    const nextQ = q || datasetData.q || '';
    const nextA = a ?? datasetData.a ?? '';

    const { tokens } = await updateDatasetDataDefaultIndexes({
      dataId,
      q: nextQ,
      a: nextA,
      model: vectorModel,
      indexSize: collection.indexSize,
      indexPrefix: indexPrefixTitle ? `# ${name}` : undefined
    });

    if (tokens > 0) {
      pushGenerateVectorUsage({
        teamId,
        tmbId,
        inputTokens: tokens,
        model: vectorModel
      });
    }
  }

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

  return UpdateDatasetDataResponseSchema.parse({});
}

export default NextAPI(handler);
