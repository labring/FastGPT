import { EmbeddingTrainTaskStatusEnum } from '@fastgpt/global/core/train/embedding/constants';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import type { I18nT, TrainTaskItem } from '../types';
import type { TrainTaskSummary } from '@/pages/api/common/system/getInitData';

export const runningTrainTaskStatusSet = new Set<string>([
  EmbeddingTrainTaskStatusEnum.running,
  RerankTrainTaskStatusEnum.running
]);

export const pendingTrainTaskStatusSet = new Set<string>([
  EmbeddingTrainTaskStatusEnum.pending,
  RerankTrainTaskStatusEnum.pending
]);

export const completedTrainTaskStatus = new Set<string>([
  RerankTrainTaskStatusEnum.completed,
  EmbeddingTrainTaskStatusEnum.completed
]);

export const errorTrainTaskStatusSet = new Set<string>([
  EmbeddingTrainTaskStatusEnum.failed,
  RerankTrainTaskStatusEnum.failed
]);

export const hasRunningTrainTask = (summary?: TrainTaskSummary) => !!summary?.hasRunning;

export const hasErrorTrainTask = (summary?: TrainTaskSummary) => !!summary?.hasError;

export const isRunningTrainTaskStatus = (status: string) => runningTrainTaskStatusSet.has(status);

export const isPendingTrainTaskStatus = (status: string) => pendingTrainTaskStatusSet.has(status);

export const isCompletedTrainTaskStatus = (status: string) => completedTrainTaskStatus.has(status);

export const isFailedTrainTaskStatus = (status: string) => errorTrainTaskStatusSet.has(status);

export const getTrainTaskStatusText = (status: string, t: I18nT) => {
  switch (status) {
    case RerankTrainTaskStatusEnum.pending:
    case EmbeddingTrainTaskStatusEnum.pending:
      return t('app:learning_status_pending');
    case RerankTrainTaskStatusEnum.running:
    case EmbeddingTrainTaskStatusEnum.running:
      return t('account_model:train_status_training');
    case RerankTrainTaskStatusEnum.completed:
    case EmbeddingTrainTaskStatusEnum.completed:
      return t('account_model:train_status_completed');
    case RerankTrainTaskStatusEnum.failed:
    case EmbeddingTrainTaskStatusEnum.failed:
      return t('account_model:train_status_error');
    case RerankTrainTaskStatusEnum.cancelled:
    case EmbeddingTrainTaskStatusEnum.cancelled:
      return t('app:learning_status_cancelled');
    default:
      return t('app:learning_status_pending');
  }
};
