import { NextAPI } from '@/service/middleware/entry';
import { isImageEmbeddingModel } from '@fastgpt/global/core/ai/model/utils';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { assertAuthModels } from '@fastgpt/service/support/permission/model/auth';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';

import { seedDatasetRebuildTasks } from '@/service/core/dataset/queues/rebuild';
import {
  rebuildableDatasetDataMatch,
  rebuildingDatasetDataMatch
} from '@fastgpt/global/core/dataset/data/utils';
import {
  RebuildEmbeddingBodySchema,
  RebuildEmbeddingResponseSchema,
  type RebuildEmbeddingResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<RebuildEmbeddingResponse> {
  const { datasetId, vectorModelId } = parseApiInput({
    req,
    bodySchema: RebuildEmbeddingBodySchema
  }).body;

  const { teamId, tmbId, isRoot, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });
  const { handle: modelHandle } = await assertAuthModels({
    actor: { teamId, tmbId, isRoot },
    modelIds: [vectorModelId],
    action: 'use'
  });
  const vectorModelData = modelHandle.getEmbeddingModelData({ modelId: vectorModelId });

  // check vector model
  if (String(dataset.vectorModelId || '') === vectorModelData.modelId) {
    return Promise.reject('vectorModel 不合法');
  }

  // check rebuilding or training
  const [rebuilding, training] = await Promise.all([
    MongoDatasetData.findOne({ teamId, datasetId, ...rebuildingDatasetDataMatch }),
    MongoDatasetTraining.findOne({ teamId, datasetId })
  ]);

  if (rebuilding || training) {
    return Promise.reject('数据集正在训练或者重建中，请稍后再试');
  }

  // 此处只维护后续导入的图片索引开关；重建本身不解析图片或查询 VLM 模型。
  const supportImageIndex =
    isImageEmbeddingModel(vectorModelData) || !!(dataset.vlmModelId || dataset.vlmModel);

  const { usageId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: '切换索引模型',
    billSource: UsageSourceEnum.training,
    vectorModelId: vectorModelData.modelId!
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
        datasetId,
        // 只标记已完成索引的数据：待索引数据还没有向量，向量必然按处理时刻的模型生成，
        // 无需重建；该过滤同时避免同一 dataId 出现原链路任务与重建任务双写。
        ...rebuildableDatasetDataMatch
      },
      {
        $set: {
          indexStatus: DatasetDataIndexStatusEnum.rebuildIndexPending
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
    billId: String(usageId)
  });

  return RebuildEmbeddingResponseSchema.parse(undefined);
}

export default NextAPI(handler);
