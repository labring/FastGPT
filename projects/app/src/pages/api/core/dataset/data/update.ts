import { updateData2Dataset } from '@/service/core/dataset/data/controller';
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
import {
  buildDatasetDataIndexRebuildPlan,
  ensureDatasetVlmModel,
  getAvailableDatasetVlmModel
} from '@fastgpt/service/core/dataset/utils';
import {
  getEmbeddingModel,
  getLLMModel,
  isImageEmbeddingModel
} from '@fastgpt/service/core/ai/model';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

async function handler(req: ApiRequestProps): Promise<UpdateDatasetDataResponse> {
  const { dataId, q, a, indexes = [] } = UpdateDatasetDataBodySchema.parse(req.body);

  // auth data permission
  const { teamId, tmbId, collection, datasetData } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: WritePermissionVal
  });
  const dataset = await ensureDatasetVlmModel(collection.dataset);
  const vectorModel = dataset.vectorModel;
  const availableVlmModel = getAvailableDatasetVlmModel(dataset.vlmModel);
  const supportVlm = !!availableVlmModel;
  const supportImageEmbedding = isImageEmbeddingModel(vectorModel);
  const nextQ = q || datasetData.q || '';
  const nextA = a ?? datasetData.a ?? '';
  const rebuildPlan = buildDatasetDataIndexRebuildPlan({
    indexes,
    existingIndexes: datasetData.indexes,
    oldQ: datasetData.q,
    oldA: datasetData.a,
    nextQ,
    nextA,
    supportVlm,
    supportImageEmbedding,
    imageIndex: !!collection.imageIndex,
    autoIndexes: !!collection.autoIndexes,
    isImageCollection: collection.type === DatasetCollectionTypeEnum.images,
    imageId: datasetData.imageId,
    imageDescMap: datasetData.imageDescMap
  });
  const rebuildTrainingMode = rebuildPlan.needRebuildVlmImageIndex
    ? TrainingModeEnum.image
    : rebuildPlan.needRebuildAutoIndex
      ? TrainingModeEnum.auto
      : undefined;
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

  if (q || a || indexes.length > 0) {
    if (rebuildTrainingMode) {
      const { usageId } = await createTrainingUsage({
        teamId,
        tmbId,
        appName: collection.name,
        billSource: UsageSourceEnum.training,
        vectorModel: getEmbeddingModel(vectorModel)?.name || vectorModel,
        agentModel: getLLMModel(dataset.agentModel)?.name,
        vllmModel: availableVlmModel?.name
      });

      await MongoDatasetTraining.deleteMany({ dataId });
      const training = await MongoDatasetTraining.create({
        teamId,
        tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: usageId,
        mode: rebuildTrainingMode,
        q: nextQ,
        a: nextA,
        dataId,
        ...(datasetData.imageId && { imageId: datasetData.imageId }),
        chunkIndex: datasetData.chunkIndex,
        indexSize: collection.indexSize,
        indexes: rebuildPlan.indexes,
        retryCount: 5
      });

      pushUpdateDataAuditLog();
      return UpdateDatasetDataResponseSchema.parse({
        dataId,
        rebuilding: true,
        trainingId: String(training._id)
      });
    }

    const { tokens } = await updateData2Dataset({
      dataId,
      q,
      a,
      indexes: rebuildPlan.indexes,
      model: vectorModel,
      indexPrefix: collection.indexPrefixTitle ? `# ${collection.name}` : undefined
    });

    pushGenerateVectorUsage({
      teamId,
      tmbId,
      inputTokens: tokens,
      model: vectorModel
    });

    pushUpdateDataAuditLog();
  }

  return UpdateDatasetDataResponseSchema.parse({
    dataId,
    rebuilding: false
  });
}

export default NextAPI(handler);
