import type { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { GetCollectionTrainingDetailResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';

export enum TrainingStatus {
  NotStart = 'NotStart',
  Queued = 'Queued',
  Running = 'Running',
  Ready = 'Ready',
  Error = 'Error'
}

/**
 * 训练进度弹窗只有未开始阶段置灰；已完成、排队中、处理中和异常阶段都需要保持视觉激活。
 */
export const isTrainingStepHighlighted = (status: TrainingStatus) =>
  status !== TrainingStatus.NotStart;

/**
 * 判断当前集合是否已经没有任何剩余训练或最终异常。
 */
export const isTrainingDetailReady = (trainingDetail: GetCollectionTrainingDetailResponseType) =>
  Object.values(trainingDetail.queuedCounts).every((count) => count === 0) &&
  Object.values(trainingDetail.trainingCounts).every((count) => count === 0) &&
  Object.values(trainingDetail.errorCounts).every((count) => count === 0);

/**
 * 根据当前集合各训练阶段的计数计算单个阶段的展示状态。
 * 已进入后续阶段时，前序阶段展示为完成；仍被前序阶段阻塞时，后续阶段保持未开始。
 */
export const getTrainingStepStatus = ({
  trainingDetail,
  mode,
  modeOrder
}: {
  trainingDetail: GetCollectionTrainingDetailResponseType;
  mode: TrainingModeEnum;
  modeOrder: TrainingModeEnum[];
}) => {
  if (isTrainingDetailReady(trainingDetail)) return TrainingStatus.Ready;
  if (trainingDetail.errorCounts[mode] > 0) return TrainingStatus.Error;
  if (trainingDetail.trainingCounts[mode] > 0) return TrainingStatus.Running;
  if (trainingDetail.queuedCounts[mode] > 0) return TrainingStatus.Queued;

  const modeIndex = modeOrder.indexOf(mode);
  if (modeIndex === -1) return TrainingStatus.NotStart;

  const hasLaterProgress = modeOrder.slice(modeIndex + 1).some((nextMode) => {
    return (
      trainingDetail.queuedCounts[nextMode] > 0 ||
      trainingDetail.trainingCounts[nextMode] > 0 ||
      trainingDetail.errorCounts[nextMode] > 0
    );
  });

  return hasLaterProgress ? TrainingStatus.Ready : TrainingStatus.NotStart;
};
