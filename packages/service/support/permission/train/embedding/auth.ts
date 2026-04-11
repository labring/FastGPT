import type { AuthModeType } from '../../type';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { authDataset } from '../../dataset/auth';
import { MongoEmbeddingTrainset } from '../../../../core/train/embedding/trainset/schema';
import { MongoEmbeddingTrainTask } from '../../../../core/train/embedding/task/schema';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { calculateEmbeddingTrainsetStats } from '../../../../core/train/embedding/data/controller';
import { authCert } from '../../auth/common';

/**
 * Embedding trainset permission authentication
 *
 * Since trainsets are now decoupled from Apps, authentication is done by teamId ownership.
 * Returns trainset with dynamically calculated statistics.
 */
export async function authEmbeddingTrainset({
  trainsetId,
  per,
  ...props
}: AuthModeType & {
  trainsetId: string;
  per: PermissionValueType;
}) {
  const trainset = await MongoEmbeddingTrainset.findById(trainsetId).lean();
  if (!trainset) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTrainsetNotExist);
  }

  // Validate certificate and check team ownership
  const result = await authCert(props);
  if (String(result.teamId) !== String(trainset.teamId)) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTrainsetNotExist);
  }

  // Dynamically calculate statistics
  const statistics = await calculateEmbeddingTrainsetStats(trainsetId);

  return {
    ...result,
    trainset: {
      ...trainset,
      statistics
    }
  };
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
 * Embedding training task permission authentication
 *
 * Since tasks are now decoupled from Apps, authentication is done by teamId ownership.
 */
export async function authEmbeddingTrainTask({
  taskId,
  per,
  ...props
}: AuthModeType & {
  taskId: string;
  per: PermissionValueType;
}) {
  const task = await MongoEmbeddingTrainTask.findById(taskId).lean();
  if (!task) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskNotExist);
  }

  // Validate certificate and check team ownership
  const result = await authCert(props);
  if (String(result.teamId) !== String(task.teamId)) {
    return Promise.reject(EmbeddingTrainErrEnum.embeddingTaskNotExist);
  }

  return { ...result, task };
}
