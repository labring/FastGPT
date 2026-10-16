import { NextAPI } from '@/service/middleware/entry';
import { isImageEmbeddingModel } from '@fastgpt/global/core/ai/model/utils';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
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
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { startDatasetTaskAudit } from '@fastgpt/service/core/dataset/audit';
import { getErrText } from '@fastgpt/global/common/error/utils';

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
  const {
    models: [vectorModelData]
  } = await assertAuthModels({
    actor: { teamId, tmbId, isRoot },
    modelIds: [vectorModelId],
    type: ModelTypeEnum.embedding
  });

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

  const rebuildCount = await MongoDatasetData.countDocuments({
    teamId,
    datasetId,
    ...rebuildableDatasetDataMatch
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

  let auditTask: Awaited<ReturnType<typeof startDatasetTaskAudit>> | undefined;

  try {
    auditTask = await startDatasetTaskAudit({
      teamId,
      tmbId,
      event: AuditEventEnum.REBUILD_DATASET_INDEX,
      params: {
        datasetId,
        datasetName: dataset.name,
        oldModel: String(dataset.vectorModelId ?? ''),
        newModel: vectorModelData.modelId,
        count: String(rebuildCount)
      }
    });

    const seededCount = await seedDatasetRebuildTasks({
      teamId,
      tmbId,
      datasetId,
      billId: String(usageId),
      auditTaskId: auditTask.taskId
    });
    // seedDatasetRebuildTasks 在这里完成所有初始种子事务后，才解除生产阶段屏障。
    // worker 可以并行消费前面的任务，但不能在该标记落库前把审计收口；旁路失败留给补偿扫描。
    await auditTask.finish({ result: 'processing' });

    if (seededCount === 0) {
      const pendingRebuildCount = await MongoDatasetData.countDocuments({
        teamId,
        datasetId,
        indexStatus: {
          $in: [
            DatasetDataIndexStatusEnum.rebuildIndexPending,
            DatasetDataIndexStatusEnum.rebuildIndexRunning
          ]
        }
      });
      if (pendingRebuildCount > 0) {
        // seed 失败时不会再有 worker 触发收口，不能把仍待重建的数据误报为成功。
        await auditTask.fail('Failed to enqueue dataset rebuild tasks');
      } else {
        await auditTask.refresh();
      }
    } else {
      // 即使 worker 尚未启动，也让当前请求在解除屏障后主动检查一次空队列场景。
      await auditTask.refresh();
    }
  } catch (error) {
    await auditTask?.fail(getErrText(error));
    throw error;
  }

  return RebuildEmbeddingResponseSchema.parse(undefined);
}

export default NextAPI(handler);
