import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { publishTrainingWakeup } from '@fastgpt/service/core/dataset/training/wakeup';
import * as generateRebuildIndexModule from '@/service/core/dataset/queues/generateRebuildIndex';
import { cleanupSystemSync, startSystemSync } from '@/service/common/system/sync';

describe('startSystemSync (app)', () => {
  afterEach(async () => {
    await cleanupSystemSync();
    global.vectorQueueLen = 0;
    vi.restoreAllMocks();
  });

  it('启动并重启时关闭旧订阅，且不开启任何 Mongo change stream watch', async () => {
    const configWatch = vi.spyOn(MongoSystemInstanceConfig, 'watch');
    const templateWatch = vi.spyOn(MongoAppTemplate, 'watch');
    const trainingWatch = vi.spyOn(MongoDatasetTraining, 'watch');

    const closeFirst = await startSystemSync();
    await startSystemSync();
    await closeFirst();

    expect(configWatch).not.toHaveBeenCalled();
    expect(templateWatch).not.toHaveBeenCalled();
    expect(trainingWatch).not.toHaveBeenCalled();
  });

  it('收到训练唤醒信号时通过 Redis Pub/Sub 拉起对应队列，关闭后不再触发', async () => {
    global.vectorQueueLen = 0;
    const runRebuildIndex = vi
      .spyOn(generateRebuildIndexModule, 'generateRebuildIndex')
      .mockImplementation(() => {
        global.vectorQueueLen = (global.vectorQueueLen ?? 0) + 1;
        return Promise.resolve();
      });

    const close = await startSystemSync();
    await publishTrainingWakeup({ modes: [TrainingModeEnum.rebuildIndex] });

    await vi.waitFor(() => {
      expect(runRebuildIndex).toHaveBeenCalledTimes(1);
    });

    await close();
    global.vectorQueueLen = 0;
    await publishTrainingWakeup({ modes: [TrainingModeEnum.rebuildIndex] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(runRebuildIndex).toHaveBeenCalledTimes(1);
  });
});
