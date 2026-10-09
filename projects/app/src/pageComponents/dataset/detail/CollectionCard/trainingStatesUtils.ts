import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
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
 * 判断指定模式的链路是否已无剩余训练或最终异常；默认检查整个集合。
 */
export const isTrainingDetailReady = (
  trainingDetail: GetCollectionTrainingDetailResponseType,
  modes = Object.values(TrainingModeEnum)
) =>
  modes.every(
    (mode) =>
      trainingDetail.queuedCounts[mode] === 0 &&
      trainingDetail.trainingCounts[mode] === 0 &&
      trainingDetail.errorCounts[mode] === 0
  );

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
  if (isTrainingDetailReady(trainingDetail, modeOrder)) return TrainingStatus.Ready;
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
