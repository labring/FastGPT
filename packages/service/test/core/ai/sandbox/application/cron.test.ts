import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';

const cronMocks = vi.hoisted(() => ({
  setCron: vi.fn(),
  retryStaleSandboxActivations: vi.fn(),
  checkTimerLock: vi.fn(),
  findInactiveRunningSandboxResources: vi.fn(),
  stopSandboxResources: vi.fn(),
  retryStaleStoppingSandboxes: vi.fn(),
  archiveInactiveSandboxes: vi.fn(),
  retryStaleArchivingSandboxes: vi.fn()
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
    archiveInactiveSandboxes: 'archiveInactiveSandboxes',
    recoverStaleSandboxOperations: 'recoverStaleSandboxOperations'
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  findInactiveRunningSandboxResources: cronMocks.findInactiveRunningSandboxResources
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  stopSandboxResources: cronMocks.stopSandboxResources,
  retryStaleStoppingSandboxes: cronMocks.retryStaleStoppingSandboxes
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => ({
  archiveInactiveSandboxes: cronMocks.archiveInactiveSandboxes,
  retryStaleArchivingSandboxes: cronMocks.retryStaleArchivingSandboxes
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lifecycle/service', () => ({
  retryStaleSandboxActivations: cronMocks.retryStaleSandboxActivations
}));

import { cronJob } from '@fastgpt/service/core/ai/sandbox/application/cron';

describe('sandbox cron application', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemInstanceConfig = createDefaultInstanceConfig();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T01:00:00.000Z'));
    cronMocks.checkTimerLock.mockResolvedValue(true);
    cronMocks.archiveInactiveSandboxes.mockResolvedValue(undefined);
    cronMocks.retryStaleArchivingSandboxes.mockResolvedValue(undefined);
    cronMocks.retryStaleStoppingSandboxes.mockResolvedValue(undefined);
    cronMocks.retryStaleSandboxActivations.mockResolvedValue(undefined);
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

    // 同一个已注册回调应在下一轮读取新快照，不保留注册时的闲置阈值。
    getTestInstanceConfig().subservice.agentSandbox.common.suspendMinutes = 30;
    cronMocks.findInactiveRunningSandboxResources.mockResolvedValueOnce(resources);
    await callback();
    expect(cronMocks.findInactiveRunningSandboxResources).toHaveBeenLastCalledWith(
      new Date('2026-06-24T00:30:00.000Z')
    );
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

  it('runs stale archiving cleanup cron under timer lock', async () => {
    await cronJob();
    const callback = cronMocks.setCron.mock.calls[2]?.[1];
    await callback();

    expect(cronMocks.setCron).toHaveBeenCalledWith('*/10 * * * *', expect.any(Function));
    expect(cronMocks.checkTimerLock).toHaveBeenCalledWith({
      timerId: 'recoverStaleSandboxOperations',
      lockMinuted: 9
    });
    expect(cronMocks.retryStaleArchivingSandboxes).toHaveBeenCalledTimes(1);
    expect(cronMocks.retryStaleStoppingSandboxes).toHaveBeenCalledTimes(1);
    expect(cronMocks.retryStaleSandboxActivations).toHaveBeenCalledTimes(1);
  });
});
