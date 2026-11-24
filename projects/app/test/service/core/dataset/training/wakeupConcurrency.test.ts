import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { publishTrainingWakeup } from '@fastgpt/service/core/dataset/training/wakeup';

const mocks = vi.hoisted(() => ({
  claimTrainingTask: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/training/service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/dataset/training/service')>();
  return {
    ...actual,
    claimTrainingTask: mocks.claimTrainingTask
  };
});

import { subscribeDatasetTrainingQueue } from '@/service/core/dataset/training/utils';

describe('subscribeDatasetTrainingQueue concurrency slot filling with real worker loops', () => {
  const prevVectorMaxProcess = getSystemInstanceConfig().performance.dataset.vectorMaxProcess;
  let activeSub: ReturnType<typeof subscribeDatasetTrainingQueue> | undefined;
  const releases: Array<() => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    releases.length = 0;
    global.preCreatedQueueLen = 0;
    global.vectorQueueLen = 0;
    getSystemInstanceConfig().performance.dataset.vectorMaxProcess = 4;
  });

  afterEach(async () => {
    for (const release of releases.splice(0)) {
      release();
    }
    await activeSub?.close();
    activeSub = undefined;
    getSystemInstanceConfig().performance.dataset.vectorMaxProcess = prevVectorMaxProcess;
  });

  it('单一 index 合并唤醒事件立即补满真实 generatePreCreatedData 并发槽位，并维持 rebuildIndex 单并发', async () => {
    let claimCount = 0;
    mocks.claimTrainingTask.mockImplementation(async ({ mode }) => {
      if (mode === TrainingModeEnum.index) {
        claimCount += 1;
        // 阻塞前 4 个 worker，验证单次模式唤醒同步占满全部并发槽位。
        if (claimCount <= 4) {
          await new Promise<void>((resolve) => releases.push(resolve));
        }
        return null;
      }
      if (mode === TrainingModeEnum.rebuildIndex) {
        await new Promise<void>((resolve) => releases.push(resolve));
        return null;
      }
      return null;
    });

    activeSub = subscribeDatasetTrainingQueue();
    await activeSub.ready;

    await publishTrainingWakeup({
      modes: [TrainingModeEnum.index, TrainingModeEnum.rebuildIndex]
    });

    await vi.waitFor(() => {
      expect(global.preCreatedQueueLen).toBe(4);
      expect(global.vectorQueueLen).toBe(1);
    });
    expect(releases).toHaveLength(5);

    for (const release of releases.splice(0)) {
      release();
    }

    await vi.waitFor(() => {
      expect(global.preCreatedQueueLen).toBe(0);
      expect(global.vectorQueueLen).toBe(0);
    });
  });
});
