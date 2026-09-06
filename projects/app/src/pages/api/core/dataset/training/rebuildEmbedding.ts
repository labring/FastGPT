import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import {
  getLLMModelData,
  getEmbeddingModelData,
  getOptionalVlmModelData
} from '@fastgpt/service/core/ai/model';
import { getDatasetImageIndexCapability } from '@fastgpt/service/core/dataset/utils';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  RebuildEmbeddingBodySchema,
  RebuildEmbeddingResponseSchema,
  type RebuildEmbeddingResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { seedDatasetRebuildTasks } from '@/service/core/dataset/queues/rebuild';

async function handler(req: ApiRequestProps): Promise<RebuildEmbeddingResponse> {
  const { datasetId, vectorModelId } = parseApiInput({
    req,
    bodySchema: RebuildEmbeddingBodySchema
  }).body;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });

  const vectorModelData = getEmbeddingModelData({ modelId: vectorModelId });

  // check vector model
  if (String(dataset.vectorModelId || '') === vectorModelData.modelId) {
    return Promise.reject('vectorModel 不合法');
  }

  // check rebuilding or training
  const [rebuilding, training] = await Promise.all([
    MongoDatasetData.findOne({ teamId, datasetId, rebuilding: true }),
    MongoDatasetTraining.findOne({ teamId, datasetId })
  ]);

  if (rebuilding || training) {
    return Promise.reject('数据集正在训练或者重建中，请稍后再试');
  }

  const vlmModelData = getOptionalVlmModelData({
    modelId: dataset.vlmModelId ? String(dataset.vlmModelId) : undefined,
    model: dataset.vlmModel
  });
  const { availableVlmModel, supportImageIndex } = getDatasetImageIndexCapability({
    vectorModel: vectorModelData,
    vlmModel: vlmModelData
  });

  const { usageId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: '切换索引模型',
    billSource: UsageSourceEnum.training,
    vectorModelId: vectorModelData.modelId!,
    agentModelId: getLLMModelData({
      modelId: dataset.agentModelId ? String(dataset.agentModelId) : undefined,
      model: dataset.agentModel
    }).modelId,
    vllmModelId: availableVlmModel?.modelId
  });

  // update vector model and dataset.data rebuild field
  await mongoSessionRun(async (session) => {
    await MongoDataset.findByIdAndUpdate(
      datasetId,
      {
        $set: {
          vectorModelId: vectorModelData.modelId,
          ...(!supportImageIndex && { 'chunkSettings.imageIndex': false })
        }
      },
      { session }
    );
    if (!supportImageIndex) {
      await MongoDatasetCollection.updateMany(
        {
          teamId,
          datasetId
        },
        {
          $set: {
            imageIndex: false
          }
        },
        { session }
      );
    }
    await MongoDatasetData.updateMany(
      {
        teamId,
        datasetId
      },
      {
        $set: {
          rebuilding: true
        }
      },
      {
        session
      }
    );
  });

  await seedDatasetRebuildTasks({
    teamId,
    tmbId,
    datasetId,
    billId: String(usageId),
    vectorModel: vectorModelData,
    vlmModel: vlmModelData
  });

  return RebuildEmbeddingResponseSchema.parse(undefined);
}

export default NextAPI(handler);
