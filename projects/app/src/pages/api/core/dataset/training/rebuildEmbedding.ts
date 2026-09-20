import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

import { getDatasetImageIndexCapability } from '@fastgpt/service/core/dataset/utils';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { addAuditLog, failAuditLogByTaskId } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { randomUUID } from 'node:crypto';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  RebuildEmbeddingBodySchema,
  RebuildEmbeddingResponseSchema,
  type RebuildEmbeddingResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { seedDatasetRebuildTasks } from '@/service/core/dataset/queues/rebuild';
import { refreshTrainingAuditTask } from '@fastgpt/service/core/dataset/training/audit';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

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
  const modelHandle = await getModelHandle();
  const vectorModelData = modelHandle.getEmbeddingModelData({ modelId: vectorModelId });

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

  const vlmModelData = modelHandle.getVlmModelData(
    {
      modelId: dataset.vlmModelId ? String(dataset.vlmModelId) : undefined,
      model: dataset.vlmModel
    },
    { optional: true }
  );
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
    agentModelId: modelHandle.getLLMModelData({
      modelId: dataset.agentModelId ? String(dataset.agentModelId) : undefined,
      model: dataset.agentModel
    }).modelId,
    vllmModelId: availableVlmModel?.modelId
  });

  const auditTaskId = randomUUID();
  // 只统计重建范围，不把全量数据块物化到内存；失败项由收口逻辑按需追加到 details
  const rebuildCount = await MongoDatasetData.countDocuments({ teamId, datasetId });

  // 事务先完成模型切换和 rebuilding 标记，避免留下没有对应业务状态的处理中事件。
  let auditCreated = false;
  try {
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

    try {
      await addAuditLog({
        teamId,
        tmbId,
        event: AuditEventEnum.REBUILD_DATASET_INDEX,
        params: {
          datasetId,
          datasetName: dataset.name,
          oldModel: String(dataset.vectorModelId ?? ''),
          newModel: vectorModelData.modelId,
          count: String(rebuildCount),
          taskId: auditTaskId,
          result: 'processing'
        }
      });
      auditCreated = true;
    } catch (error) {
      logger.error('Dataset rebuild audit write failed', { error, datasetId, auditTaskId });
    }
    const seededCount = await seedDatasetRebuildTasks({
      teamId,
      tmbId,
      datasetId,
      billId: String(usageId),
      vectorModel: vectorModelData,
      vlmModel: vlmModelData,
      auditTaskId
    });
    if (seededCount === 0) {
      await refreshTrainingAuditTask(auditTaskId);
    }
  } catch (error) {
    if (auditCreated) {
      // 审计收口失败不能掩盖重建本身的异常
      await failAuditLogByTaskId({
        teamId,
        taskId: auditTaskId,
        scope: 'member',
        event: AuditEventEnum.REBUILD_DATASET_INDEX,
        failureReason: getErrText(error)
      }).catch((auditError) => {
        logger.error('Dataset rebuild audit failure update failed', {
          error: auditError,
          datasetId,
          auditTaskId
        });
      });
    }
    throw error;
  }

  return RebuildEmbeddingResponseSchema.parse(undefined);
}

export default NextAPI(handler);
