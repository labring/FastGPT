import { describe, expect, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  publishTrainingWakeup,
  subscribeTrainingWakeup,
  trainingWakeupChannel
} from '@fastgpt/service/core/dataset/training/wakeup';

describe('dataset training wakeup signal', () => {
  it('deduplicates modes and delivers Pub/Sub wakeup signal to subscribers', async () => {
    const receivedModes: TrainingModeEnum[][] = [];
    const sub = subscribeTrainingWakeup({
      onModes: (modes) => {
        receivedModes.push(modes);
      }
    });
    await sub.ready;

    await publishTrainingWakeup({
      modes: [TrainingModeEnum.qa, TrainingModeEnum.index, TrainingModeEnum.qa]
    });

    await vi.waitFor(() =>
      expect(receivedModes).toContainEqual([TrainingModeEnum.qa, TrainingModeEnum.index])
    );

    await sub.close();
  });

  it('swallows Redis publish errors so cron fallback keeps training resilient', async () => {
    const spy = vi
      .spyOn(trainingWakeupChannel, 'publish')
      .mockRejectedValueOnce(new Error('redis down'));

    await expect(
      publishTrainingWakeup({ modes: [TrainingModeEnum.parse] })
    ).resolves.toBeUndefined();

    spy.mockRestore();
  });
});
