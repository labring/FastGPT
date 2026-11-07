import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { addAuditLog, addAuditLogs } from '@fastgpt/service/support/user/audit/util';
import type { AuditResourceType } from '@fastgpt/global/support/user/audit/type';

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

  it('writes resource IDs separately from display metadata', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockResolvedValue(undefined as never);
    const resources = [{ appId: '68ad85a7463006c963799a05' }];

    await addAuditLog({ ...input, resources });

    expect(create).toHaveBeenCalledWith({
      teamId: input.teamId,
      tmbId: input.tmbId,
      event: input.event,
      resources,
      metadata: input.params
    });
  });

  it('writes a system-scoped audit without a member ID', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockResolvedValue(undefined as never);
    const params = { name: 'System', datasetName: 'Dataset', datasetType: 'dataset' };

    await expect(
      addAuditLog({
        teamId: input.teamId,
        scope: 'system',
        event: AuditEventEnum.CREATE_DATASET,
        params
      })
    ).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledWith({
      teamId: input.teamId,
      scope: 'system',
      event: AuditEventEnum.CREATE_DATASET,
      metadata: params
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

describe('addAuditLogs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves resource associations and accepts entries without resources in one batch', async () => {
    const insertMany = vi.spyOn(MongoTeamAudit, 'insertMany').mockResolvedValue([] as never);
    const resources = [
      { datasetId: '68ad85a7463006c963799a05' },
      { collectionId: '68ad85a7463006c963799a06' }
    ];

    await addAuditLogs([{ ...input, resources }, input]);

    expect(insertMany).toHaveBeenCalledWith(
      [
        {
          teamId: input.teamId,
          tmbId: input.tmbId,
          event: input.event,
          resources,
          metadata: input.params
        },
        {
          teamId: input.teamId,
          tmbId: input.tmbId,
          event: input.event,
          metadata: input.params
        }
      ],
      { ordered: true }
    );
  });

  it('skips an empty batch', async () => {
    const insertMany = vi.spyOn(MongoTeamAudit, 'insertMany');

    await expect(addAuditLogs([])).resolves.toBeUndefined();

    expect(insertMany).not.toHaveBeenCalled();
  });
});

describe('audit resource associations', () => {
  const objectId = '68ad85a7463006c963799a05';

  it('accepts one ID per item and preserves absent resources on legacy logs', async () => {
    expectTypeOf<{ appId: string }>().toExtend<AuditResourceType>();
    expectTypeOf<{ appId: string; skillId: string }>().not.toExtend<AuditResourceType>();

    const audit = new MongoTeamAudit({
      teamId: objectId,
      tmbId: objectId,
      event: AuditEventEnum.LOGIN,
      resources: [
        { appId: objectId },
        { datasetId: objectId },
        { skillId: objectId },
        { collectionId: objectId }
      ]
    });
    await expect(audit.validate()).resolves.toBeUndefined();

    const legacyAudit = new MongoTeamAudit({
      teamId: objectId,
      tmbId: objectId,
      event: AuditEventEnum.LOGIN
    });
    await expect(legacyAudit.validate()).resolves.toBeUndefined();
    expect(legacyAudit.toObject().resources).toBeUndefined();
  });

  it.each([
    {},
    { appId: objectId, skillId: objectId },
    { appId: 'invalid-id' },
    { appId: objectId, unknownId: objectId }
  ])('rejects an invalid resource item %j', async (resource) => {
    const audit = new MongoTeamAudit({
      teamId: objectId,
      tmbId: objectId,
      event: AuditEventEnum.LOGIN,
      resources: [resource]
    });

    await expect(audit.validate()).rejects.toThrow();
  });
});
