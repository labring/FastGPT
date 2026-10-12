import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';

const mocks = vi.hoisted(() => ({
  findSandboxInstanceBySource: vi.fn(),
  countActiveSandboxInstances: vi.fn(),
  getAgentSandboxMax: vi.fn(),
  getAgentSandboxMaxPerTeam: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => mocks);
vi.mock('@fastgpt/service/core/ai/sandbox/config', () => mocks);

import { checkSandboxQuota } from '@fastgpt/service/core/ai/sandbox/application/quota';

const identity = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1',
  teamId: 'team-1',
  current: null
};

describe('checkSandboxQuota', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.countActiveSandboxInstances.mockResolvedValue(0);
    mocks.getAgentSandboxMax.mockReturnValue(10);
    mocks.getAgentSandboxMaxPerTeam.mockReturnValue(5);
  });

  it('skips quota checks for active instances even when quotas are full', async () => {
    mocks.findSandboxInstanceBySource.mockResolvedValue({
      status: 'running',
      teamId: identity.teamId
    });
    mocks.countActiveSandboxInstances.mockResolvedValue(100);
    await expect(
      checkSandboxQuota({
        ...identity,
        current: { status: 'running', teamId: identity.teamId } as any
      })
    ).resolves.toBeUndefined();
    expect(mocks.countActiveSandboxInstances).not.toHaveBeenCalled();
  });

  it('checks system quota then team quota using the prepared team id', async () => {
    await expect(checkSandboxQuota(identity)).resolves.toBeUndefined();
    expect(mocks.countActiveSandboxInstances.mock.calls).toEqual([[], [{ teamId: 'team-1' }]]);
  });

  it('rejects when system or team limit is reached', async () => {
    // 系统配额满：直接拒绝且不检查团队配额
    mocks.countActiveSandboxInstances.mockResolvedValueOnce(10);
    await expect(checkSandboxQuota(identity)).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxLimitReached
    });
    expect(mocks.countActiveSandboxInstances).toHaveBeenCalledTimes(1);

    // 团队配额满：系统通过后被团队配额拦截
    mocks.countActiveSandboxInstances.mockReset();
    mocks.countActiveSandboxInstances.mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    await expect(checkSandboxQuota(identity)).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxTeamLimitReached
    });
  });

  it('handles disabled quotas gracefully', async () => {
    // 仅系统配额未配置：正常检查团队配额
    mocks.getAgentSandboxMax.mockReturnValue(undefined);
    await checkSandboxQuota(identity);
    expect(mocks.countActiveSandboxInstances.mock.calls).toEqual([[{ teamId: 'team-1' }]]);

    // 两级配额均未配置：跳过计数查询
    mocks.countActiveSandboxInstances.mockReset();
    mocks.getAgentSandboxMaxPerTeam.mockReturnValue(undefined);
    await checkSandboxQuota(identity);
    expect(mocks.countActiveSandboxInstances).not.toHaveBeenCalled();
  });
});
