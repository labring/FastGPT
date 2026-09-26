import type { FilterQuery, PopulateOptions } from 'mongoose';
import type { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import type { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetTraining } from './schema';
import { TRAINING_LEASE_TIMEOUT_MS } from '@fastgpt/global/core/dataset/training/constant';

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
