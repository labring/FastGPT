import {
  updateDatasetDataSystemIndexes,
  updateDatasetDataByIndexes
} from '@/service/core/dataset/data/data';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateDatasetDataBodySchema,
  UpdateDatasetDataResponseSchema,
  type UpdateDatasetDataResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { replaceS3KeyToPreviewUrl } from '@fastgpt/service/core/dataset/utils';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { addHours } from 'date-fns';

async function handler(req: ApiRequestProps): Promise<UpdateDatasetDataResponse> {
  const { dataId, q, a, indexes } = parseApiInput({
    req,
    bodySchema: UpdateDatasetDataBodySchema
  }).body;
  const hasIndexes = Object.hasOwn(req.body, 'indexes');

  // auth data permission
  const {
    collection: { name, indexPrefixTitle },
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

  const dataset = collection.dataset;
  const vectorModel = dataset.vectorModel;
  const nextQ = q ?? datasetData.q ?? '';
  const nextA = a ?? datasetData.a ?? '';
  const pushUpdateDataAuditLog = () => {
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
  };

  if (hasIndexes) {
    // 兼容旧 API：调用方显式传 indexes 时仍按完整索引更新。
    // imageEmbedding 是系统索引，不能被外部 indexes 覆盖，统一由 dataIndex 根据数据内容重建。
    const manualIndexes = indexes?.filter(
      (index) => index.type !== DatasetDataIndexTypeEnum.imageEmbedding
    );
    const { tokens } = await updateDatasetDataByIndexes({
      dataId,
      q: nextQ,
      a: nextA,
      imageId: datasetData.imageId,
      imageIndex: !!collection.imageIndex,
      indexes: manualIndexes || [],
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
  } else if (!!nextQ || !!datasetData.imageId) {
    const { tokens } = await updateDatasetDataSystemIndexes({
      dataId,
      q: nextQ,
      a: nextA,
      imageId: datasetData.imageId,
      imageIndex: !!collection.imageIndex,
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

  pushUpdateDataAuditLog();

  return UpdateDatasetDataResponseSchema.parse({
    q: replaceS3KeyToPreviewUrl(nextQ, addHours(new Date(), 1)),
    a: nextA ? replaceS3KeyToPreviewUrl(nextA, addHours(new Date(), 1)) : undefined
  });
}

export default NextAPI(handler);
