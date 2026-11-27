import { z } from 'zod';
import type { DbSession } from '@fastgpt/dal/db/types';
import { SignalPubSubChannel } from '@fastgpt/dal/redis/caches/pubSubSync';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getLogger, LogCategories } from '../../../common/logger';

const getTrainingLogger = () =>
  getLogger(LogCategories?.MODULE?.DATASET?.TRAINING ?? LogCategories?.SYSTEM);

const TrainingWakeupPayloadSchema = z.object({
  modes: z.array(z.enum(TrainingModeEnum)).min(1)
});

export const trainingWakeupChannel = new SignalPubSubChannel({
  namespace: 'dataset:training:wakeup',
  payloadSchema: TrainingWakeupPayloadSchema
});

/**
 * 知识库训练队列唤醒信号（替代 `MongoDatasetTraining.watch()`）。
 *
 * 传入 `tx` 时挂载在 `tx.afterCommit` 上，保证事务内写入仅在提交后才广播唤醒；
 * 未传入 `tx` 时立即发布。推送失败只打告警，由主仓/商业版既有的分钟级 Cron 兜底拉起消费。
 */
export const publishTrainingWakeup = async ({
  modes,
  tx
}: {
  modes: readonly TrainingModeEnum[];
  tx?: DbSession | null;
}): Promise<void> => {
  const uniqueModes = Array.from(new Set(modes));
  if (uniqueModes.length === 0) {
    return;
  }

  const publish = async () => {
    try {
      await trainingWakeupChannel.publish({ modes: uniqueModes });
    } catch (error) {
      getTrainingLogger()?.warn?.('Failed to publish dataset training wakeup signal', {
        modes: uniqueModes,
        error
      });
    }
  };

  if (tx !== null && tx !== undefined) {
    tx.afterCommit(publish);
    return;
  }

  await publish();
};

export const subscribeTrainingWakeup = ({
  onModes
}: {
  onModes: (modes: TrainingModeEnum[]) => Promise<void> | void;
}) =>
  trainingWakeupChannel.subscribe({
    logger: getTrainingLogger(),
    onMessage: ({ modes }) => onModes(modes)
  });
