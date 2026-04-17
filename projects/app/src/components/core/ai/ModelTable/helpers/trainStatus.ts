import { EmbeddingTrainTaskStatusEnum } from '@fastgpt/global/core/train/embedding/constants';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import type { I18nT, TrainTaskItem } from '../types';

export const runningTrainTaskStatusSet = new Set<string>([
  EmbeddingTrainTaskStatusEnum.pending,
  EmbeddingTrainTaskStatusEnum.running,
  RerankTrainTaskStatusEnum.pending,
  RerankTrainTaskStatusEnum.running
]);

export const errorTrainTaskStatusSet = new Set<string>([
  EmbeddingTrainTaskStatusEnum.failed,
  RerankTrainTaskStatusEnum.failed
]);

export const hasRunningTrainTask = (trainTaskList?: TrainTaskItem[]) =>
  !!trainTaskList?.some((task) => runningTrainTaskStatusSet.has(task.status));

export const hasErrorTrainTask = (trainTaskList?: TrainTaskItem[]) =>
  !!trainTaskList?.some((task) => errorTrainTaskStatusSet.has(task.status));

export const isRunningTrainTaskStatus = (status: string) => runningTrainTaskStatusSet.has(status);

export const isFailedTrainTaskStatus = (status: string) => errorTrainTaskStatusSet.has(status);

export const getTrainTaskStatusConfig = (status: string, t: I18nT) => {
  switch (status) {
    case RerankTrainTaskStatusEnum.pending:
    case EmbeddingTrainTaskStatusEnum.pending:
      return {
        label: t('app:learning_status_pending'),
        colorSchema: 'gray' as const
      };
    case RerankTrainTaskStatusEnum.running:
    case EmbeddingTrainTaskStatusEnum.running:
      return {
        label: t('account_model:train_status_training'),
        colorSchema: 'blue' as const
      };
    case RerankTrainTaskStatusEnum.completed:
    case EmbeddingTrainTaskStatusEnum.completed:
      return {
        label: t('account_model:train_status_completed'),
        colorSchema: 'green' as const
      };
    case RerankTrainTaskStatusEnum.failed:
    case EmbeddingTrainTaskStatusEnum.failed:
      return {
        label: t('account_model:train_status_error'),
        colorSchema: 'red' as const
      };
    case RerankTrainTaskStatusEnum.cancelled:
    case EmbeddingTrainTaskStatusEnum.cancelled:
      return {
        label: t('app:learning_status_cancelled'),
        colorSchema: 'gray' as const
      };
    default:
      return {
        label: t('app:learning_status_pending'),
        colorSchema: 'gray' as const
      };
  }
};
