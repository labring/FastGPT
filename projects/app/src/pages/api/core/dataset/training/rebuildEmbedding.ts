import { NextAPI } from '@/service/middleware/entry';
import { isImageEmbeddingModel } from '@fastgpt/global/core/ai/model/utils';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { hasDatasetTrainingTask } from '@fastgpt/service/core/dataset/training/entity';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { finalErrorTrainingMatch } from '@fastgpt/service/core/dataset/training/query';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
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

  // 只统计仍在处理中的训练/重建；最终失败或永久锁定的任务不阻塞切换。
  if (await hasDatasetTrainingTask({ teamId, datasetId })) {
    return Promise.reject('数据集正在训练或者重建中，请稍后再试');
  }
  // 仍可重试的同义词重建任务（含欠费暂停）之后会被重试执行，并与本次重建改同一批 data；
  // 若放行，它会与新建的 rebuildIndex 任务双写同一批 data，必须先等它结束。
  if (
    await MongoDatasetTraining.exists({
      teamId,
      datasetId,
      mode: TrainingModeEnum.rebuildSynonym,
      retryCount: { $gt: 0 }
    })
  ) {
    return Promise.reject('同义词重建未完成，请稍后再切换模型');
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

  // 首次索引失败的数据没有可用索引，rebuildIndex 只能重算已有索引；
  // 这类数据要随新模型重新走一遍首次索引。
  const failedDataList = await MongoDatasetData.find(
    {
      teamId,
      datasetId,
      indexStatus: DatasetDataIndexStatusEnum.error
    },
    { _id: 1, collectionId: 1, q: 1, a: 1, imageId: 1, indexes: 1, chunkIndex: 1 }
  ).lean();
  // 预落库数据的 data.indexes 为空，custom/question/summary 等草稿只保存在失败任务里；
  // 删除旧任务前必须取回，否则换模型会静默丢失用户索引和增强结果。
  const failedDataIds = failedDataList.map((item) => item._id);
  const failedIndexTasks = failedDataIds.length
    ? await MongoDatasetTraining.find(
        {
          teamId,
          datasetId,
          mode: TrainingModeEnum.index,
          dataId: { $in: failedDataIds },
          ...finalErrorTrainingMatch
        },
        { dataId: 1, q: 1, a: 1, indexSize: 1, indexes: 1, imageDescMap: 1 }
      ).lean()
    : [];
  const failedTaskByDataId = new Map(failedIndexTasks.map((task) => [String(task.dataId), task]));

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
    // 只删除本次已原子替换的任务：
    // - error 数据的 index 失败任务（下面会重新入队）；
    // - rebuildIndex 失败/暂停任务（其 data 会重新标记 pending 并生成新任务）；
    // - 最终失败的同义词重建任务：其 data 是 rebuildSynonymFailed，会随全量重建重新入队；
    //   保留它会让用户在切换后重试旧任务，与 rebuildIndex 双写同一 data。
    // 欠费暂停的普通 index 任务（data 仍为 indexing）不在任何重排路径里，必须保留，
    // 否则数据会变成“无任务、无索引、无重试入口”的孤儿。
    await MongoDatasetTraining.deleteMany(
      {
        teamId,
        datasetId,
        $or: [
          { mode: TrainingModeEnum.index, dataId: { $in: failedDataIds } },
          { mode: TrainingModeEnum.rebuildIndex },
          { mode: TrainingModeEnum.rebuildSynonym, retryCount: { $lte: 0 } }
        ],
        ...finalErrorTrainingMatch
      },
      { session }
    );
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
        },
        $unset: { indexErrorMsg: '' }
      },
      {
        session
      }
    );

    if (failedDataList.length) {
      // 首次索引失败的 data 进入普通 index 队列，按新模型重新生成索引与向量。
      await MongoDatasetData.updateMany(
        {
          teamId,
          datasetId,
          _id: { $in: failedDataList.map((item) => item._id) }
        },
        {
          $set: { indexStatus: DatasetDataIndexStatusEnum.indexing },
          $unset: { indexErrorMsg: '' }
        },
        { session }
      );

      const dataByCollection = new Map<string, typeof failedDataList>();
      failedDataList.forEach((item) => {
        const collectionId = String(item.collectionId);
        const list = dataByCollection.get(collectionId) ?? [];
        list.push(item);
        dataByCollection.set(collectionId, list);
      });
      for (const [collectionId, data] of dataByCollection) {
        await pushDataListToTrainingQueue({
          teamId,
          tmbId,
          datasetId,
          collectionId,
          vectorModel: vectorModelData,
          mode: TrainingModeEnum.index,
          billId: String(usageId),
          session,
          data: data.map((item) => {
            const failedTask = failedTaskByDataId.get(String(item._id));
            return {
              // data 有正文时以 data 为准（用户可修正失败数据）；data 为空时回退训练任务，
              // 保留 imageParse 生成但尚未写回 data 的正文，同时保留空串语义。
              q: item.q || failedTask?.q || '',
              a: item.a || failedTask?.a,
              imageId: item.imageId,
              dataId: String(item._id),
              chunkIndex: item.chunkIndex,
              // 保留失败任务原本的向量切分大小；缺失时由队列按模型默认值补齐
              indexSize: failedTask?.indexSize,
              // 优先恢复失败任务里的完整草稿（custom/question/summary/image）
              indexes: failedTask?.indexes?.length ? failedTask.indexes : item.indexes,
              ...(failedTask?.imageDescMap && { imageDescMap: failedTask.imageDescMap })
            };
          })
        });
      }
    }
  });

  await seedDatasetRebuildTasks({
    teamId,
    tmbId,
    datasetId,
    billId: String(usageId)
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
