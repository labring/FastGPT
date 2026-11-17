import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxUnavailableReasonEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';

const mocks = vi.hoisted(() => ({
  checkTeamSandboxPermission: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: mocks.checkTeamSandboxPermission
}));

import {
  assertSandboxAvailable,
  resolveAppSandboxAvailability
} from '@fastgpt/service/core/ai/sandbox/application/availability';

describe('resolveAppSandboxAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemInstanceConfig = createDefaultInstanceConfig();
    getTestInstanceConfig().subservice.agentSandbox.provider = 'opensandbox';
    mocks.checkTeamSandboxPermission.mockResolvedValue(undefined);
  });

  it('returns systemDisabled without checking the team plan', async () => {
    getTestInstanceConfig().subservice.agentSandbox.provider = 'none';

    await expect(
      resolveAppSandboxAvailability({ appEnabled: true, teamId: 'team_1' })
    ).resolves.toEqual({
      available: false,
      reason: SandboxUnavailableReasonEnum.systemDisabled
    });
    expect(mocks.checkTeamSandboxPermission).not.toHaveBeenCalled();
  });

  it('returns appDisabled without checking the team plan', async () => {
    await expect(
      resolveAppSandboxAvailability({ appEnabled: false, teamId: 'team_1' })
    ).resolves.toEqual({
      available: false,
      reason: SandboxUnavailableReasonEnum.appDisabled
    });
    expect(mocks.checkTeamSandboxPermission).not.toHaveBeenCalled();
  });

  it('returns teamPlanUnavailable when the team plan check fails', async () => {
    mocks.checkTeamSandboxPermission.mockRejectedValueOnce(new Error('no permission'));

    await expect(
      resolveAppSandboxAvailability({ appEnabled: true, teamId: 'team_1' })
    ).resolves.toEqual({
      available: false,
      reason: SandboxUnavailableReasonEnum.teamPlanUnavailable
    });
  });

  it('returns available after the team plan check succeeds', async () => {
    await expect(
      resolveAppSandboxAvailability({ appEnabled: true, teamId: 'team_1' })
    ).resolves.toEqual({ available: true });
    expect(mocks.checkTeamSandboxPermission).toHaveBeenCalledWith('team_1');
  });
});

describe('assertSandboxAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemInstanceConfig = createDefaultInstanceConfig();
    getTestInstanceConfig().subservice.agentSandbox.provider = 'opensandbox';
    mocks.checkTeamSandboxPermission.mockResolvedValue(undefined);
  });

  it('rejects before the team check when the system feature is disabled', async () => {
    getTestInstanceConfig().subservice.agentSandbox.provider = 'none';

    await expect(assertSandboxAvailable('team_1')).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxPermissionDenied
    });
    expect(mocks.checkTeamSandboxPermission).not.toHaveBeenCalled();
  });

  it('normalizes team plan failures to the sandbox permission error', async () => {
    mocks.checkTeamSandboxPermission.mockRejectedValueOnce(new Error('no permission'));

    await expect(assertSandboxAvailable('team_1')).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxPermissionDenied
    });
  });
});
