import { NextAPI } from '@/service/middleware/entry';
import { isImageEmbeddingModel } from '@fastgpt/global/core/ai/model/utils';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { BLOCKED_LOCK_TIME } from '@fastgpt/service/core/dataset/training/query';
import {
  TrainingModeEnum,
  datasetSwitchableTrainingModes,
  datasetSwitchBlockedIndexStatuses
} from '@fastgpt/global/core/dataset/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { assertAuthModels } from '@fastgpt/service/support/permission/model/auth';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';

import { seedDatasetRebuildTasks } from '@/service/core/dataset/queues/rebuild';
import { rebuildableDatasetDataMatch } from '@fastgpt/global/core/dataset/data/utils';
import {
  RebuildEmbeddingBodySchema,
  RebuildEmbeddingResponseSchema,
  type RebuildEmbeddingResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import { getTrainingAuditModelLabel } from '@fastgpt/service/core/dataset/audit/training';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';

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
    handle: modelHandle,
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

  // 切换前置条件：除“首次索引最终失败”外，数据集必须处于静止状态。
  // 快速失败和事务内复核都读主库，避免副本延迟误判。
  const assertDatasetSwitchable = async (session?: ClientSession | null) => {
    // 任务只允许 index/rebuild* 的终态（retryCount<=0）；
    // retryCount>0（active / lockTime>=BLOCKED）与前置阶段任务均阻塞。
    const blockedTask = await MongoDatasetTraining.findOne(
      {
        teamId,
        datasetId,
        $or: [{ retryCount: { $gt: 0 } }, { mode: { $nin: datasetSwitchableTrainingModes } }]
      },
      { _id: 1, mode: 1, retryCount: 1, lockTime: 1 }
    )
      .session(session ?? null)
      .lean();
    if (blockedTask) {
      if (blockedTask.retryCount > 0) {
        if (new Date(blockedTask.lockTime) < BLOCKED_LOCK_TIME) {
          throw new Error('数据集正在训练或者重建中，请稍后再试');
        }
        throw new Error('存在暂停或可恢复的训练任务，请先重试或删除后再切换模型');
      }
      throw new Error('存在未完成的解析或增强任务，请先重试或删除后再切换模型');
    }
    // 只有已完成（indexed / 两种重建失败）或首次索引失败（error）的数据可以进入切换。
    const blockedData = await MongoDatasetData.findOne(
      { teamId, datasetId, indexStatus: { $in: datasetSwitchBlockedIndexStatuses } },
      { _id: 1 }
    )
      .session(session ?? null)
      .lean();
    if (blockedData) {
      throw new Error('存在未完成的索引数据，请等待处理完成后再切换模型');
    }
  };
  await assertDatasetSwitchable();

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
    // 并发导入/同义词上传可能在上面的快速失败之后提交；写入前在同一事务快照内复核。
    await assertDatasetSwitchable(session);

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
    // 只标记已有向量的数据；error 数据没有向量，保持原状，由用户在异常列表重试。
    await MongoDatasetData.updateMany(
      {
        teamId,
        datasetId,
        ...rebuildableDatasetDataMatch
      },
      {
        $set: {
          indexStatus: DatasetDataIndexStatusEnum.rebuildIndexPending,
          updateTime: new Date()
        },
        $unset: { indexErrorMsg: '' }
      },
      {
        session
      }
    );

    // error 数据的 final-error index 任务是其重试入口，必须保留；
    // 其余 mode=index 任务（indexed / 重建失败数据的 stale 记录）一并删除。
    const errorDataList = await MongoDatasetData.find(
      {
        teamId,
        datasetId,
        indexStatus: DatasetDataIndexStatusEnum.error
      },
      { _id: 1 }
    )
      .session(session)
      .lean();
    const errorDataIds = new Set(errorDataList.map((item) => String(item._id)));
    const indexTasks = await MongoDatasetTraining.find(
      {
        teamId,
        datasetId,
        mode: TrainingModeEnum.index
      },
      { _id: 1, dataId: 1 }
    )
      .session(session)
      .lean();
    const staleIndexTaskIds = indexTasks
      .filter((task) => !task.dataId || !errorDataIds.has(String(task.dataId)))
      .map((task) => task._id);

    await MongoDatasetTraining.deleteMany(
      {
        teamId,
        datasetId,
        $or: [
          { _id: { $in: staleIndexTaskIds } },
          // 前置条件已排除 active / 暂停 / 前置任务；剩余重建任务都是死任务，
          // 保留会让用户手动重试与新的 rebuild 双写同一 data。
          { mode: { $in: [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym] } }
        ]
      },
      { session }
    );

    // 写屏障：快照内的 recheck 看不到快照之后的重试/worker 完成写。
    // 对保留的 error data 做一次无业务语义的写入，与重试 API / worker 的
    // data 写产生真实事务冲突；冲突方重试后会按新模型重新索引，或将已 indexed
    // 的数据纳入本次重建，避免旧模型结果以 indexed 终态落库。
    if (errorDataList.length > 0) {
      await MongoDatasetData.updateMany(
        { _id: { $in: errorDataList.map((item) => item._id) } },
        { $set: { updateTime: new Date() } },
        { session }
      );
    }

    // 与待重建状态同事务提交，避免提交后 seed 失败留下 pending 且零任务。
    await seedDatasetRebuildTasks(
      {
        teamId,
        tmbId,
        datasetId,
        billId: String(usageId)
      },
      session
    );
  });

  // 审计复用鉴权时的模型快照，避免重建提交后为日志再次查询目录版本。
  // 名称与稳定 ID 分开保留；旧模型已删除时由保存的引用提供展示兜底。
  {
    const oldModelReference = getDatasetModelReference(dataset, 'embedding');
    const oldModel = getTrainingAuditModelLabel({
      reference: oldModelReference,
      model: modelHandle.findModelData(oldModelReference)
    });
    const newModel = getTrainingAuditModelLabel({
      reference: { modelId: vectorModelData.modelId, model: vectorModelData.model },
      model: vectorModelData
    });
    addAuditLog({
      tmbId,
      teamId,
      event: DatasetAuditEventEnum.DATASET_INDEX_REBUILD,
      params: {
        datasetName: dataset.name,
        oldModelName: oldModel.modelName,
        newModelName: newModel.modelName,
        oldModelId: oldModel.modelId,
        newModelId: newModel.modelId
      }
    });
  }

  return RebuildEmbeddingResponseSchema.parse(undefined);
}

export default NextAPI(handler);
