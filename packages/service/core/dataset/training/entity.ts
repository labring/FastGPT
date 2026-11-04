import type { FilterQuery, PopulateOptions } from 'mongoose';
import type { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetTraining } from './schema';
import { TRAINING_LEASE_TIMEOUT_MS } from '@fastgpt/global/core/dataset/training/constant';
import { MongoDatasetData } from '../data/schema';
import { rebuildingDatasetDataMatch } from '@fastgpt/global/core/dataset/data/utils';
import { readFromSecondary } from '../../../common/mongo/utils';
import { activeTrainingMatch } from './query';

/**
 * 判断知识库是否仍有“处理中”的训练任务，找到一条即停止，不计算数量或返回任务内容。
 * 重建以 data 状态为准，只统计 pending/running；最终失败不阻塞模型切换。
 * training 只查仍在队列中的普通任务，最终失败/残留的重建队列记录不计入。
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
      ...rebuildingDatasetDataMatch
    },
    { _id: 1 },
    readFromSecondary
  ).lean();
  if (rebuildData) return true;

  const training = await MongoDatasetTraining.findOne(
    {
      teamId,
      datasetId,
      mode: { $nin: [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym] },
      ...activeTrainingMatch
    },
    { _id: 1 },
    readFromSecondary
  ).lean();
  return !!training;
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
