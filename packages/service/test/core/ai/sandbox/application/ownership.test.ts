import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  resolveSandboxSourceTeamId: vi.fn(),
  findSandboxInstanceBySource: vi.fn(),
  backfillSandboxInstanceTeamId: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => mocks);
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => mocks);

import { ensureSandboxTeamOwnership } from '@fastgpt/service/core/ai/sandbox/application/ownership';

const identity = {
  sandboxId: 'sandbox-1',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1'
};
const instance = { ...identity, provider: 'sealosdevbox', status: 'archived' };

describe('ensureSandboxTeamOwnership', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveSandboxSourceTeamId.mockResolvedValue('team-1');
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.backfillSandboxInstanceTeamId.mockResolvedValue({ matchedCount: 1 });
  });

  it('resolves ownership for a new instance without persisting a record', async () => {
    await expect(ensureSandboxTeamOwnership(identity)).resolves.toMatchObject({ teamId: 'team-1' });
    expect(mocks.resolveSandboxSourceTeamId).toHaveBeenCalledWith(identity);
    expect(mocks.backfillSandboxInstanceTeamId).not.toHaveBeenCalled();
  });

  it('preserves matching existing ownership', async () => {
    mocks.findSandboxInstanceBySource.mockResolvedValue({ ...instance, teamId: 'team-1' });
    await expect(ensureSandboxTeamOwnership(identity)).resolves.toMatchObject({ teamId: 'team-1' });
    expect(mocks.backfillSandboxInstanceTeamId).not.toHaveBeenCalled();
  });

  it('backfills missing ownership using persisted provider', async () => {
    mocks.findSandboxInstanceBySource.mockResolvedValue(instance);
    await expect(ensureSandboxTeamOwnership(identity)).resolves.toMatchObject({ teamId: 'team-1' });
    expect(mocks.backfillSandboxInstanceTeamId).toHaveBeenCalledWith({
      provider: 'sealosdevbox',
      sandboxId: identity.sandboxId,
      teamId: 'team-1'
    });
  });

  it('rejects missing source ownership or identity/team conflict', async () => {
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
      teamId: 'other-team'
    });
    await expect(ensureSandboxTeamOwnership(identity)).rejects.toThrow(
      'Sandbox team ownership mismatch'
    );
  });

  it('accepts verified concurrent backfill and rejects unconfirmed backfill', async () => {
    // 并发写入已持久化完成：再次确认命中
    mocks.findSandboxInstanceBySource
      .mockResolvedValueOnce(instance)
      .mockResolvedValueOnce({ ...instance, teamId: 'team-1' });
    mocks.backfillSandboxInstanceTeamId.mockResolvedValueOnce({ matchedCount: 0 });
    await expect(ensureSandboxTeamOwnership(identity)).resolves.toMatchObject({ teamId: 'team-1' });

    // 并发未确认或归属不符：拒绝激活
    mocks.findSandboxInstanceBySource
      .mockResolvedValueOnce(instance)
      .mockResolvedValueOnce({ ...instance, teamId: 'other-team' });
    mocks.backfillSandboxInstanceTeamId.mockResolvedValueOnce({ matchedCount: 0 });
    await expect(ensureSandboxTeamOwnership(identity)).rejects.toThrow(
      'Sandbox team ownership was not persisted'
    );
  });
});
