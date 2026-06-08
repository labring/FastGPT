import { beforeEach, describe, expect, it, vi } from 'vitest';

const cronMocks = vi.hoisted(() => ({
  setCron: vi.fn(),
  checkTimerLock: vi.fn(),
  findInactiveRunningSandboxResources: vi.fn(),
  stopSandboxResources: vi.fn(),
  archiveInactiveSandboxes: vi.fn()
}));

vi.mock('@fastgpt/service/common/system/cron', () => ({
  setCron: cronMocks.setCron
}));

vi.mock('@fastgpt/service/common/system/timerLock/utils', () => ({
  checkTimerLock: cronMocks.checkTimerLock
}));

vi.mock('@fastgpt/service/common/system/timerLock/constants', () => ({
  TimerIdEnum: {
    archiveInactiveSandboxes: 'archiveInactiveSandboxes'
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/instance/repository', () => ({
  findInactiveRunningSandboxResources: cronMocks.findInactiveRunningSandboxResources
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/resource', () => ({
  stopSandboxResources: cronMocks.stopSandboxResources
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/archive', () => ({
  archiveInactiveSandboxes: cronMocks.archiveInactiveSandboxes
}));

import { cronJob } from '@fastgpt/service/core/ai/sandbox/service/cron';

describe('sandbox cron service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cronMocks.checkTimerLock.mockResolvedValue(true);
    cronMocks.archiveInactiveSandboxes.mockResolvedValue(undefined);
  });

  it('registers a cron task and skips when no inactive sandbox exists', async () => {
    cronMocks.findInactiveRunningSandboxResources.mockResolvedValueOnce([]);

    await cronJob();
    const callback = cronMocks.setCron.mock.calls[0]?.[1];
    await callback();

    expect(cronMocks.setCron).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function));
    expect(cronMocks.findInactiveRunningSandboxResources).toHaveBeenCalledWith(expect.any(Date));
    expect(cronMocks.stopSandboxResources).not.toHaveBeenCalled();
  });

  it('stops inactive running sandbox resources', async () => {
    const resources = [{ provider: 'opensandbox', sandboxId: 'sandbox-1' }];
    cronMocks.findInactiveRunningSandboxResources.mockResolvedValueOnce(resources);

    await cronJob();
    const callback = cronMocks.setCron.mock.calls[0]?.[1];
    await callback();

    expect(cronMocks.stopSandboxResources).toHaveBeenCalledWith(resources);
  });

  it('runs archive cron under timer lock', async () => {
    await cronJob();
    const callback = cronMocks.setCron.mock.calls[1]?.[1];
    await callback();

    expect(cronMocks.setCron).toHaveBeenCalledWith('0 */12 * * *', expect.any(Function));
    expect(cronMocks.checkTimerLock).toHaveBeenCalledWith({
      timerId: 'archiveInactiveSandboxes',
      lockMinuted: 660
    });
    expect(cronMocks.archiveInactiveSandboxes).toHaveBeenCalledTimes(1);
  });
});
