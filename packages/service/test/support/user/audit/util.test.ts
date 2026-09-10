import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';

vi.unmock('@fastgpt/service/support/user/audit/util');

const input = {
  teamId: 'team-id',
  tmbId: 'member-id',
  event: AuditEventEnum.TRANSFER_TEAM_OWNERSHIP,
  params: { teamName: 'Team', oldOwnerName: 'Old owner', newOwnerName: 'New owner' }
};

describe('addAuditLog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes audit metadata', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockResolvedValue(undefined as never);
    await expect(addAuditLog(input)).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledWith({
      teamId: input.teamId,
      tmbId: input.tmbId,
      event: input.event,
      metadata: input.params
    });
  });

  it('retries temporary write failures', async () => {
    const create = vi
      .spyOn(MongoTeamAudit, 'create')
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue(undefined as never);
    await expect(addAuditLog(input)).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('handles exhausted retries internally', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockRejectedValue(new Error('unavailable'));
    await expect(addAuditLog(input)).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(4);
  });
});
