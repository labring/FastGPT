import type { AuthModeType } from '../../type';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { authApp } from '../../app/auth';
import { authDataset } from '../../dataset/auth';
import { MongoRerankTrainset } from '../../../../core/train/rerank/trainset/schema';
import { MongoRerankTrainTask } from '../../../../core/train/rerank/task/schema';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { calculateTrainsetStats } from '../../../../core/train/rerank/data/controller';

/**
 * Rerank trainset permission authentication - reuses App permissions
 *
 * Returns trainset with dynamically calculated statistics.
 */
export async function authRerankTrainset({
  trainsetId,
  per,
  ...props
}: AuthModeType & {
  trainsetId: string;
  per: PermissionValueType;
}) {
  // Get trainset with teamId for permission check
  const trainset = await MongoRerankTrainset.findById(trainsetId).lean();
  if (!trainset) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotExist);
  }

  // Validate app permission
  const result = await authApp({
    ...props,
    appId: String(trainset.appId),
    per
  });

  // Dynamically calculate statistics
  const statistics = await calculateTrainsetStats(trainsetId);

  return {
    ...result,
    trainset: {
      ...trainset,
      statistics
    }
  };
}

/**
 * Authenticate trainset by appId - reuses App permissions
 */
export async function authRerankTrainsetByAppId({
  appId,
  per,
  ...props
}: AuthModeType & {
  appId: string;
  per: PermissionValueType;
}) {
  const trainset = await MongoRerankTrainset.findOne({ appId }).lean();
  if (!trainset) {
    return Promise.reject(RerankTrainErrEnum.trainsetNotExist);
  }

  const result = await authApp({
    ...props,
    appId,
    per
  });

  return { ...result, trainset };
}

/**
 * Authenticate permission to generate training data from datasets
 */
export async function authGenerateFromDatasets({
  datasetIds,
  ...props
}: AuthModeType & {
  datasetIds: string[];
}) {
  // Validate read permission for each dataset
  const datasets = await Promise.all(
    datasetIds.map(async (datasetId) => {
      const { dataset } = await authDataset({
        ...props,
        datasetId,
        per: ReadPermissionVal
      });
      return dataset;
    })
  );

  return { datasets };
}

/**
 * Rerank training task permission authentication - reuses App permissions
 * Note: This function is used in the training task module, predefined here
 */
export async function authRerankTrainTask({
  taskId,
  per,
  ...props
}: AuthModeType & {
  taskId: string;
  per: PermissionValueType;
}) {
  const task = await MongoRerankTrainTask.findById(taskId).lean();
  if (!task) {
    return Promise.reject(RerankTrainErrEnum.taskNotExist);
  }

  const result = await authApp({
    ...props,
    appId: String(task.appId),
    per
  });

  return { ...result, task };
}
