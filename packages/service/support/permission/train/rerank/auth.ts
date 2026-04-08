import type { AuthModeType } from '../../type';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { authDataset } from '../../dataset/auth';
import { MongoRerankTrainset } from '../../../../core/train/rerank/trainset/schema';
import { MongoRerankTrainTask } from '../../../../core/train/rerank/task/schema';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { calculateRerankTrainsetStats } from '../../../../core/train/rerank/data/controller';
import { authCert } from '../../auth/common';

/**
 * Rerank trainset permission authentication
 *
 * Since trainsets are now decoupled from Apps, authentication is done by teamId ownership.
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
  const trainset = await MongoRerankTrainset.findById(trainsetId).lean();
  if (!trainset) {
    return Promise.reject(RerankTrainErrEnum.rerankTrainsetNotExist);
  }

  // Validate certificate and check team ownership
  const result = await authCert(props);
  if (String(result.teamId) !== String(trainset.teamId)) {
    return Promise.reject(RerankTrainErrEnum.rerankTrainsetNotExist);
  }

  // Dynamically calculate statistics
  const statistics = await calculateRerankTrainsetStats(trainsetId);

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
 * Rerank training task permission authentication
 *
 * Since tasks are now decoupled from Apps, authentication is done by teamId ownership.
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
    return Promise.reject(RerankTrainErrEnum.rerankTaskNotExist);
  }

  // Validate certificate and check team ownership
  const result = await authCert(props);
  if (String(result.teamId) !== String(task.teamId)) {
    return Promise.reject(RerankTrainErrEnum.rerankTaskNotExist);
  }

  return { ...result, task };
}
