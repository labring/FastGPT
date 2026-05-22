import { beforeEach, describe, expect, it, vi } from 'vitest';

const cronMocks = vi.hoisted(() => ({
  setCron: vi.fn(),
  findInactiveRunningSandboxResources: vi.fn(),
  stopSandboxResources: vi.fn()
}));

vi.mock('@fastgpt/service/common/system/cron', () => ({
  setCron: cronMocks.setCron
}));

vi.mock('@fastgpt/service/core/ai/sandbox/instance/repository', () => ({
  findInactiveRunningSandboxResources: cronMocks.findInactiveRunningSandboxResources
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/resource', () => ({
  stopSandboxResources: cronMocks.stopSandboxResources
}));

import { cronJob } from '@fastgpt/service/core/ai/sandbox/service/cron';

describe('sandbox cron service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
