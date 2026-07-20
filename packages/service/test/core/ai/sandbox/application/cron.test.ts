import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cronMocks = vi.hoisted(() => ({
  setCron: vi.fn(),
  checkTimerLock: vi.fn(),
  findInactiveRunningSandboxResources: vi.fn(),
  stopSandboxResources: vi.fn(),
  archiveInactiveSandboxes: vi.fn(),
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/system/cron', () => ({
  setCron: cronMocks.setCron
}));

vi.mock('@fastgpt/service/common/system/timerLock/utils', () => ({
  checkTimerLock: cronMocks.checkTimerLock
}));

vi.mock('@fastgpt/service/common/system/timerLock/constants', () => ({
  TimerIdEnum: {
    stopInactiveSandboxes: 'stopInactiveSandboxes',
    archiveInactiveSandboxes: 'archiveInactiveSandboxes'
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  findInactiveRunningSandboxResources: cronMocks.findInactiveRunningSandboxResources
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  stopSandboxResources: cronMocks.stopSandboxResources
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => ({
  archiveInactiveSandboxes: cronMocks.archiveInactiveSandboxes
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } },
  getLogger: () => cronMocks.logger
}));

import { cronJob } from '@fastgpt/service/core/ai/sandbox/application/cron';

describe('sandbox cron application', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T01:00:00.000Z'));
    cronMocks.checkTimerLock.mockResolvedValue(true);
    cronMocks.archiveInactiveSandboxes.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops inactive running sandbox resources', async () => {
    const resources = [{ provider: 'opensandbox', sandboxId: 'sandbox-1' }];
    cronMocks.findInactiveRunningSandboxResources.mockResolvedValueOnce(resources);

    await cronJob();
    const callback = cronMocks.setCron.mock.calls[0]?.[1];
    await callback();

    expect(cronMocks.setCron).toHaveBeenCalledWith('*/10 * * * *', expect.any(Function));
    expect(cronMocks.checkTimerLock).toHaveBeenCalledWith({
      timerId: 'stopInactiveSandboxes',
      lockMinuted: 9
    });
    expect(cronMocks.findInactiveRunningSandboxResources).toHaveBeenCalledWith(
      new Date('2026-06-24T00:50:00.000Z')
    );
    expect(cronMocks.stopSandboxResources).toHaveBeenCalledWith(resources);
  });

  it('does not query resources when the scheduler timer lock is held', async () => {
    cronMocks.checkTimerLock.mockResolvedValueOnce(false);

    await cronJob();
    const callback = cronMocks.setCron.mock.calls[0]?.[1];
    await callback();

    expect(cronMocks.findInactiveRunningSandboxResources).not.toHaveBeenCalled();
    expect(cronMocks.stopSandboxResources).not.toHaveBeenCalled();
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

  it('does not archive when the archive timer lock is held', async () => {
    cronMocks.checkTimerLock.mockResolvedValueOnce(false);

    await cronJob();
    const callback = cronMocks.setCron.mock.calls[1]?.[1];
    await callback();

    expect(cronMocks.archiveInactiveSandboxes).not.toHaveBeenCalled();
  });

  it('logs archive failures without rejecting the cron callback', async () => {
    const error = new Error('archive failed');
    cronMocks.archiveInactiveSandboxes.mockRejectedValueOnce(error);

    await cronJob();
    const callback = cronMocks.setCron.mock.calls[1]?.[1];

    await expect(callback()).resolves.toBeUndefined();
    expect(cronMocks.logger.error).toHaveBeenCalledWith('Sandbox archive cron failed', { error });
  });
});
