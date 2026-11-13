import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cronMocks = vi.hoisted(() => ({
  setCron: vi.fn(),
  retryStaleSandboxActivations: vi.fn(),
  checkTimerLock: vi.fn(),
  findInactiveRunningSandboxResources: vi.fn(),
  stopSandboxResources: vi.fn(),
  retryStaleStoppingSandboxes: vi.fn(),
  retryStaleDeletingSandboxes: vi.fn(),
  reconcileOrphanSandboxResources: vi.fn(),
  getAgentSandboxSuspendMinutes: vi.fn()
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
    recoverStaleSandboxOperations: 'recoverStaleSandboxOperations',
    reconcileOrphanSandboxResources: 'reconcileOrphanSandboxResources'
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  findInactiveRunningSandboxResources: cronMocks.findInactiveRunningSandboxResources
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  stopSandboxResources: cronMocks.stopSandboxResources,
  retryStaleStoppingSandboxes: cronMocks.retryStaleStoppingSandboxes,
  retryStaleDeletingSandboxes: cronMocks.retryStaleDeletingSandboxes,
  reconcileOrphanSandboxResources: cronMocks.reconcileOrphanSandboxResources
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lifecycle/service', () => ({
  retryStaleSandboxActivations: cronMocks.retryStaleSandboxActivations
}));

vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
  getAgentSandboxSuspendMinutes: cronMocks.getAgentSandboxSuspendMinutes
}));

import { cronJob } from '@fastgpt/service/core/ai/sandbox/application/cron';

describe('sandbox cron application', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T01:00:00.000Z'));
    cronMocks.checkTimerLock.mockResolvedValue(true);
    cronMocks.retryStaleStoppingSandboxes.mockResolvedValue(undefined);
    cronMocks.retryStaleDeletingSandboxes.mockResolvedValue(undefined);
    cronMocks.retryStaleSandboxActivations.mockResolvedValue(undefined);
    cronMocks.reconcileOrphanSandboxResources.mockResolvedValue(undefined);
    cronMocks.getAgentSandboxSuspendMinutes.mockReturnValue(60);
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
      new Date('2026-06-24T00:00:00.000Z')
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
});
