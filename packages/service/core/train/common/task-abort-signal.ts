import { getGlobalRedisConnection } from '../../../common/redis';

export type TrainTaskType = 'rerank' | 'embedding';
export type TrainTaskAbortReason = 'deleted' | 'cancelled';

const TRAIN_TASK_ABORT_SIGNAL_TTL_SECONDS = 60 * 60;

const getTrainTaskAbortSignalKey = (type: TrainTaskType, taskId: string) =>
  `train:${type}:task-abort:${taskId}`;

export async function setTrainTaskAbortSignal({
  type,
  taskId,
  reason
}: {
  type: TrainTaskType;
  taskId: string;
  reason: TrainTaskAbortReason;
}) {
  await getGlobalRedisConnection().set(
    getTrainTaskAbortSignalKey(type, taskId),
    reason,
    'EX',
    TRAIN_TASK_ABORT_SIGNAL_TTL_SECONDS
  );
}

export async function getTrainTaskAbortSignal({
  type,
  taskId
}: {
  type: TrainTaskType;
  taskId: string;
}): Promise<TrainTaskAbortReason | null> {
  const reason = await getGlobalRedisConnection().get(getTrainTaskAbortSignalKey(type, taskId));

  return reason === 'deleted' || reason === 'cancelled' ? reason : null;
}
