import type { FilterQuery, PopulateOptions } from 'mongoose';
import type { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  TrainingModeEnum,
  datasetSwitchableTrainingModes,
  datasetSwitchBlockedIndexStatuses
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetTraining } from './schema';
import { TRAINING_LEASE_TIMEOUT_MS } from '@fastgpt/global/core/dataset/training/constant';
import { MongoDatasetData } from '../data/schema';
import {
  rebuildingDatasetDataMatch,
  datasetDataRebuildFailedStatuses
} from '@fastgpt/global/core/dataset/data/utils';
import { readFromSecondary } from '../../../common/mongo/utils';

/**
 * 判断知识库是否仍有训练任务，找到一条即停止，不计算数量或返回任务内容。
 * 重建以 data 状态为准，包含失败记录；training 只查普通任务，忽略残留的重建队列记录。
 */
export const hasDatasetTrainingTask = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<boolean> => {
  const rebuildData = await MongoDatasetData.findOne(
    {
      teamId,
      datasetId,
      indexStatus: {
        $in: [...rebuildingDatasetDataMatch.indexStatus.$in, ...datasetDataRebuildFailedStatuses]
      }
    },
    { _id: 1 },
    readFromSecondary
  ).lean();
  if (rebuildData) return true;

  const training = await MongoDatasetTraining.findOne(
    {
      teamId,
      datasetId,
      mode: { $nin: [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym] }
    },
    { _id: 1 },
    readFromSecondary
  ).lean();
  return !!training;
};

/**
 * 训练任务/索引数据是否允许切换 embedding 模型。
 * 只用于 UI 的换模型入口：final-error 的 index/rebuild 任务不阻塞；
 * retryCount > 0（active / lockTime>=BLOCKED）与前置阶段任务阻塞。
 * 读主库，避免副本延迟把刚结束的重建判为进行中。
 */
export const canSwitchEmbeddingModel = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<boolean> => {
  const blockingTraining = await MongoDatasetTraining.exists({
    teamId,
    datasetId,
    $or: [{ retryCount: { $gt: 0 } }, { mode: { $nin: datasetSwitchableTrainingModes } }]
  });
  if (blockingTraining) return false;

  const blockingData = await MongoDatasetData.exists({
    teamId,
    datasetId,
    indexStatus: { $in: datasetSwitchBlockedIndexStatuses }
  });
  return !blockingData;
};

/** 原子领取任务，返回更新后的租约；领取不消耗业务重试次数。 */
export type FindAndLockTrainingTaskOptions = {
  mode: TrainingModeEnum;
  filter?: FilterQuery<DatasetTrainingSchemaType>;
  populate?: PopulateOptions[];
};

export const findAndLockTrainingTask = <T>({
  mode,
  filter = {},
  populate = []
}: FindAndLockTrainingTaskOptions) =>
  MongoDatasetTraining.findOneAndUpdate(
    {
      ...filter,
      mode,
      retryCount: { $gt: 0 },
      lockTime: { $lte: new Date(Date.now() - TRAINING_LEASE_TIMEOUT_MS) }
    },
    { $set: { lockTime: new Date() } },
    { new: true }
  )
    .populate<T>(populate)
    .lean();
