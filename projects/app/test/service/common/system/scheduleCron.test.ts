import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setCron: vi.fn(),
  scan: vi.fn(),
  checkTimerLock: vi.fn()
}));
vi.mock('@fastgpt/service/common/system/cron', () => ({ setCron: mocks.setCron }));
vi.mock('@/service/core/app/utils', () => ({ getScheduleTriggerApp: mocks.scan }));
vi.mock('@fastgpt/service/common/system/timerLock/utils', () => ({
  checkTimerLock: mocks.checkTimerLock,
  deleteTimerLock: vi.fn()
}));
vi.mock('@/service/core/dataset/training/utils', () => ({ startTrainingQueue: vi.fn() }));
vi.mock('@fastgpt/service/common/file/utils', () => ({ clearTmpUploadFiles: vi.fn() }));
vi.mock('@/service/common/system/cronTask', () => ({
  checkInvalidDatasetData: vi.fn(),
  checkInvalidVector: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/cron', () => ({ cronJob: vi.fn() }));
vi.mock('@fastgpt/service/common/s3/lifecycle/cleanup', () => ({
  clearExpiredS3FilesCron: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/modelStatus/service', () => ({
  checkAndRunModelStatusProbe: vi.fn()
}));

import { startCron } from '@/service/common/system/cron';

describe('application schedule polling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.scan.mockResolvedValue(undefined);
    mocks.checkTimerLock.mockResolvedValue(false);
  });

  const minuteTick = async () => {
    for (const [expression, callback] of mocks.setCron.mock.calls) {
      if (expression === '*/1 * * * *') await callback();
    }
  };

  it('scans on startup and on each minute without the hourly lock', async () => {
    startCron();
    expect(mocks.scan).toHaveBeenCalledTimes(1);
    await minuteTick();
    await minuteTick();
    expect(mocks.scan).toHaveBeenCalledTimes(3);
  });

  it('handles a rejected scan and continues polling next minute', async () => {
    mocks.scan.mockRejectedValueOnce(new Error('database unavailable'));
    startCron();
    await Promise.resolve();
    await minuteTick();
    expect(mocks.scan).toHaveBeenCalledTimes(2);
  });
});
