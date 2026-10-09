import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';

const mocks = vi.hoisted(() => ({
  findSandboxInstanceBySource: vi.fn(),
  countActiveSandboxInstances: vi.fn(),
  backfillSandboxInstanceTeamId: vi.fn(),
  resolveSandboxSourceTeamId: vi.fn(),
  getAgentSandboxMax: vi.fn(),
  getAgentSandboxMaxPerTeam: vi.fn(),
  warn: vi.fn()
}));
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({ warn: mocks.warn }),
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => mocks);
vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => mocks);
vi.mock('@fastgpt/service/core/ai/sandbox/config', () => mocks);

import { checkSandboxQuota } from '@fastgpt/service/core/ai/sandbox/application/quota';
import { sandboxActiveStatusList } from '@fastgpt/service/core/ai/sandbox/type';

const identity = {
  provider: 'opensandbox' as const,
  sandboxId: 'sandbox-1',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1'
};

describe('checkSandboxQuota', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.countActiveSandboxInstances.mockResolvedValue(0);
    mocks.backfillSandboxInstanceTeamId.mockResolvedValue(undefined);
    mocks.resolveSandboxSourceTeamId.mockResolvedValue('team-1');
    mocks.getAgentSandboxMax.mockReturnValue(10);
    mocks.getAgentSandboxMaxPerTeam.mockReturnValue(5);
  });

  it.each(sandboxActiveStatusList)('skips active status %s', async (status) => {
    mocks.findSandboxInstanceBySource.mockResolvedValue({ status });
    await expect(checkSandboxQuota(identity)).resolves.toBeUndefined();
    expect(mocks.countActiveSandboxInstances).not.toHaveBeenCalled();
    expect(mocks.resolveSandboxSourceTeamId).not.toHaveBeenCalled();
  });

  it('returns the source team after checking both quotas', async () => {
    await expect(checkSandboxQuota(identity)).resolves.toEqual({ teamId: 'team-1' });
    expect(mocks.countActiveSandboxInstances.mock.calls).toEqual([[], [{ teamId: 'team-1' }]]);
  });

  it('rejects the system quota at its limit with 409', async () => {
    mocks.countActiveSandboxInstances.mockResolvedValueOnce(10);
    await expect(checkSandboxQuota(identity)).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxLimitReached
    });
    expect(mocks.countActiveSandboxInstances).toHaveBeenCalledTimes(1);
  });

  it('rejects the team quota at its limit with 409', async () => {
    mocks.countActiveSandboxInstances.mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    await expect(checkSandboxQuota(identity)).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxTeamLimitReached
    });
  });

  it('checks only the system quota when source teamId is missing', async () => {
    mocks.resolveSandboxSourceTeamId.mockResolvedValue(undefined);
    await expect(checkSandboxQuota(identity)).resolves.toEqual({ teamId: undefined });
    expect(mocks.countActiveSandboxInstances.mock.calls).toEqual([[]]);
  });

  it('skips disabled quotas', async () => {
    mocks.getAgentSandboxMax.mockReturnValue(undefined);
    mocks.getAgentSandboxMaxPerTeam.mockReturnValue(undefined);
    await checkSandboxQuota(identity);
    expect(mocks.countActiveSandboxInstances).not.toHaveBeenCalled();
  });

  it('backfills missing historical teamId and preserves an existing value', async () => {
    mocks.findSandboxInstanceBySource.mockResolvedValueOnce({ status: 'stopped' });
    await checkSandboxQuota(identity);
    expect(mocks.backfillSandboxInstanceTeamId).toHaveBeenCalledWith({
      provider: identity.provider,
      sandboxId: identity.sandboxId,
      teamId: 'team-1'
    });
    mocks.backfillSandboxInstanceTeamId.mockClear();
    mocks.findSandboxInstanceBySource.mockResolvedValueOnce({
      status: 'stopped',
      teamId: 'old-team'
    });
    await checkSandboxQuota(identity);
    expect(mocks.backfillSandboxInstanceTeamId).not.toHaveBeenCalled();
  });

  it('logs backfill failures without blocking activation', async () => {
    mocks.findSandboxInstanceBySource.mockResolvedValue({ status: 'stopped' });
    mocks.backfillSandboxInstanceTeamId.mockRejectedValue(new Error('write failed'));
    await expect(checkSandboxQuota(identity)).resolves.toEqual({ teamId: 'team-1' });
    expect(mocks.warn).toHaveBeenCalled();
  });

  it('propagates Mongo query failures unchanged', async () => {
    const error = new Error('Mongo unavailable');
    mocks.countActiveSandboxInstances.mockRejectedValue(error);
    await expect(checkSandboxQuota(identity)).rejects.toBe(error);
  });
});
