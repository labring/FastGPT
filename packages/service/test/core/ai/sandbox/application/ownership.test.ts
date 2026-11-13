import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  resolveSandboxSourceTeamId: vi.fn(),
  findSandboxInstanceBySource: vi.fn(),
  assertNoUnmigratedLegacySandbox: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => mocks);
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => mocks);
vi.mock('@fastgpt/service/core/ai/sandbox/legacy/v2MigrationGate', () => mocks);

import { ensureSandboxTeamOwnership } from '@fastgpt/service/core/ai/sandbox/application/ownership';

const identity = {
  sandboxId: 'sandbox-1',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1'
};
const instance = { ...identity, provider: 'opensandbox', status: 'stopped', teamId: 'team-1' };

describe('ensureSandboxTeamOwnership', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveSandboxSourceTeamId.mockResolvedValue('team-1');
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.assertNoUnmigratedLegacySandbox.mockResolvedValue(undefined);
  });

  it('resolves ownership for a new instance and checks the legacy v2 gate without persisting a record', async () => {
    await expect(ensureSandboxTeamOwnership(identity)).resolves.toEqual({
      teamId: 'team-1',
      resource: null
    });
    expect(mocks.resolveSandboxSourceTeamId).toHaveBeenCalledWith(identity);
    expect(mocks.assertNoUnmigratedLegacySandbox).toHaveBeenCalledWith(identity);
  });

  it('preserves matching existing ownership without hitting the legacy gate', async () => {
    mocks.findSandboxInstanceBySource.mockResolvedValue(instance);
    await expect(ensureSandboxTeamOwnership(identity)).resolves.toEqual({
      teamId: 'team-1',
      resource: instance
    });
    expect(mocks.assertNoUnmigratedLegacySandbox).not.toHaveBeenCalled();
  });

  it('rejects missing source ownership, missing instance teamId, or identity/team conflict', async () => {
    mocks.resolveSandboxSourceTeamId.mockResolvedValueOnce(undefined);
    await expect(ensureSandboxTeamOwnership(identity)).rejects.toThrow(
      'Sandbox source has no teamId'
    );

    mocks.findSandboxInstanceBySource.mockResolvedValueOnce({
      ...instance,
      sandboxId: 'other-sandbox'
    });
    await expect(ensureSandboxTeamOwnership(identity)).rejects.toThrow(
      'Sandbox identity does not match'
    );

    mocks.findSandboxInstanceBySource.mockResolvedValueOnce({
      ...instance,
      teamId: undefined
    });
    await expect(ensureSandboxTeamOwnership(identity)).rejects.toThrow(
      'Sandbox team ownership mismatch'
    );

    mocks.findSandboxInstanceBySource.mockResolvedValueOnce({
      ...instance,
      teamId: 'other-team'
    });
    await expect(ensureSandboxTeamOwnership(identity)).rejects.toThrow(
      'Sandbox team ownership mismatch'
    );
  });
});
