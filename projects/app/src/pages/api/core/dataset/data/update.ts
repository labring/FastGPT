import {
  updateDatasetDataGeneratedIndexes,
  updateDatasetDataDefaultIndexes,
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
import {
  buildDatasetDataIndexRebuildPlan,
  getDatasetImageIndexCapability,
  replaceS3KeyToPreviewUrl
} from '@fastgpt/service/core/dataset/utils';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
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
  const { supportImageEmbedding } = getDatasetImageIndexCapability({
    vectorModel,
    vlmModel: dataset.vlmModel
  });
  const nextQ = q || datasetData.q || '';
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

  const shouldUseIndexRebuildPlan =
    !!collection.imageIndex || collection.type === DatasetCollectionTypeEnum.images;

  if (hasIndexes) {
    // 兼容旧 API：调用方显式传 indexes 时仍按完整索引更新。
    // imageEmbedding 是系统索引，不能被外部 indexes 覆盖或误删，必须从数据库当前值保留。
    const manualIndexes = indexes?.filter(
      (index) => index.type !== DatasetDataIndexTypeEnum.imageEmbedding
    );
    const preservedImageEmbeddingIndexes = datasetData.indexes.filter(
      (index) => index.type === DatasetDataIndexTypeEnum.imageEmbedding
    );
    const { tokens } = await updateDatasetDataByIndexes({
      dataId,
      q: nextQ,
      a: nextA,
      indexes: [...(manualIndexes || []), ...preservedImageEmbeddingIndexes],
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
  } else if (shouldUseIndexRebuildPlan) {
    const baseIndexes = datasetData.indexes.filter(
      (index) => index.type !== DatasetDataIndexTypeEnum.default
    );
    const rebuildPlan = buildDatasetDataIndexRebuildPlan({
      indexes: baseIndexes,
      existingIndexes: datasetData.indexes,
      nextQ,
      supportImageEmbedding,
      imageIndex: !!collection.imageIndex,
      isImageCollection: collection.type === DatasetCollectionTypeEnum.images,
      imageId: datasetData.imageId
    });

    const generatedIndexes = rebuildPlan.indexes.filter(
      (index) => index.type === DatasetDataIndexTypeEnum.imageEmbedding
    );

    const { tokens } = await updateDatasetDataGeneratedIndexes({
      dataId,
      q: nextQ,
      a: nextA,
      indexes: generatedIndexes,
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
  } else if (q !== undefined || a !== undefined) {
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

  pushUpdateDataAuditLog();

  return UpdateDatasetDataResponseSchema.parse({
    dataId,
    rebuilding: false,
    q: replaceS3KeyToPreviewUrl(nextQ, addHours(new Date(), 1)),
    a: nextA ? replaceS3KeyToPreviewUrl(nextA, addHours(new Date(), 1)) : undefined
  });
}

export default NextAPI(handler);
