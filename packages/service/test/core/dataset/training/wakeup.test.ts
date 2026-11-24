import { describe, expect, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createTrainingTaskLease } from '@fastgpt/service/core/dataset/training/service';
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

  it('publishes target mode wakeup when lease.transition advances stage across processes', async () => {
    const receivedModes: TrainingModeEnum[][] = [];
    const sub = subscribeTrainingWakeup({
      onModes: (modes) => {
        receivedModes.push(modes);
      }
    });
    await sub.ready;

    const lockTime = new Date();
    const [task] = await MongoDatasetTraining.create([
      {
        teamId: createEntityId(),
        tmbId: createEntityId(),
        datasetId: createEntityId(),
        collectionId: createEntityId(),
        billId: 'bill-1',
        mode: TrainingModeEnum.auto,
        lockTime,
        retryCount: 3,
        q: 'hello'
      }
    ]);

    const lease = createTrainingTaskLease({
      _id: String(task._id),
      mode: TrainingModeEnum.auto,
      lockTime,
      retryCount: 3,
      teamId: String(task.teamId),
      datasetId: String(task.datasetId),
      collectionId: String(task.collectionId)
    });

    await lease.transition({ mode: TrainingModeEnum.index });
    await lease.stop();

    await vi.waitFor(() => expect(receivedModes).toContainEqual([TrainingModeEnum.index]));
    await sub.close();
  });
});
