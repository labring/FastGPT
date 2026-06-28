import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cronMocks = vi.hoisted(() => ({
  setCron: vi.fn(),
  checkTimerLock: vi.fn(),
  findInactiveRunningSandboxResources: vi.fn(),
  stopSandboxResources: vi.fn(),
  archiveInactiveSandboxes: vi.fn(),
  clearStaleArchivingSandboxes: vi.fn()
}));

vi.mock('@fastgpt/service/common/system/cron', () => ({
  setCron: cronMocks.setCron
}));

vi.mock('@fastgpt/service/common/system/timerLock/utils', () => ({
  checkTimerLock: cronMocks.checkTimerLock
}));

vi.mock('@fastgpt/service/common/system/timerLock/constants', () => ({
  TimerIdEnum: {
    archiveInactiveSandboxes: 'archiveInactiveSandboxes',
    clearStaleArchivingSandboxes: 'clearStaleArchivingSandboxes'
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  findInactiveRunningSandboxResources: cronMocks.findInactiveRunningSandboxResources
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  stopSandboxResources: cronMocks.stopSandboxResources
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => ({
  archiveInactiveSandboxes: cronMocks.archiveInactiveSandboxes,
  clearStaleArchivingSandboxes: cronMocks.clearStaleArchivingSandboxes
}));

import { cronJob } from '@fastgpt/service/core/ai/sandbox/application/cron';

describe('sandbox cron application', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T01:00:00.000Z'));
    cronMocks.checkTimerLock.mockResolvedValue(true);
    cronMocks.archiveInactiveSandboxes.mockResolvedValue(undefined);
    cronMocks.clearStaleArchivingSandboxes.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers a cron task and skips when no inactive sandbox exists', async () => {
    cronMocks.findInactiveRunningSandboxResources.mockResolvedValueOnce([]);

    await cronJob();
    const callback = cronMocks.setCron.mock.calls[0]?.[1];
    await callback();

    expect(cronMocks.setCron).toHaveBeenCalledWith('*/10 * * * *', expect.any(Function));
    expect(cronMocks.findInactiveRunningSandboxResources).toHaveBeenCalledWith(
      new Date('2026-06-24T00:50:00.000Z')
    );
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

  it('runs stale archiving cleanup cron under timer lock', async () => {
    await cronJob();
    const callback = cronMocks.setCron.mock.calls[2]?.[1];
    await callback();

    expect(cronMocks.setCron).toHaveBeenCalledWith('*/10 * * * *', expect.any(Function));
    expect(cronMocks.checkTimerLock).toHaveBeenCalledWith({
      timerId: 'clearStaleArchivingSandboxes',
      lockMinuted: 9
    });
    expect(cronMocks.clearStaleArchivingSandboxes).toHaveBeenCalledTimes(1);
  });
});
