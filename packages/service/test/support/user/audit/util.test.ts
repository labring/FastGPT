import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { addAuditLog, addAuditLogs } from '@fastgpt/service/support/user/audit/util';
import {
  AuditResourceTypeEnum,
  buildAppAuditResource,
  buildCollectionAuditResource,
  buildDatasetAuditResource,
  buildEntityAuditResource,
  buildSkillAuditResource,
  normalizeStoredAuditResources,
  type AuditResourceType
} from '@fastgpt/global/support/user/audit/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';

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

  it('writes structured resources separately from display metadata', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockResolvedValue(undefined as never);
    const resources = [
      buildAppAuditResource({
        _id: '68ad85a7463006c963799a05',
        name: 'My Tool',
        avatar: 'core/app/type/pluginFill',
        type: AppTypeEnum.workflowTool
      })
    ];

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
      buildDatasetAuditResource({
        _id: '68ad85a7463006c963799a05',
        name: 'Docs',
        type: DatasetTypeEnum.dataset
      }),
      buildCollectionAuditResource({
        _id: '68ad85a7463006c963799a06',
        datasetId: '68ad85a7463006c963799a05',
        name: 'guide.pdf',
        type: DatasetCollectionTypeEnum.file
      })
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

  it('validates structured resources, supports builders, and normalizes legacy records', async () => {
    expectTypeOf<{ type: AuditResourceTypeEnum; id?: string; name?: string }>().toExtend<
      AuditResourceType
    >();

    const structured = [
      buildAppAuditResource({ _id: objectId, name: 'Bot', type: AppTypeEnum.simple }),
      buildAppAuditResource({ _id: objectId, name: 'Tool', type: AppTypeEnum.workflowTool }),
      buildAppAuditResource({ _id: objectId, name: 'Folder', type: AppTypeEnum.folder }),
      buildAppAuditResource({ _id: objectId, name: 'ToolFolder', type: AppTypeEnum.toolFolder }),
      buildDatasetAuditResource({ _id: objectId, name: 'KB', type: DatasetTypeEnum.dataset }),
      buildDatasetAuditResource({ _id: objectId, name: 'KBFolder', type: DatasetTypeEnum.folder }),
      buildCollectionAuditResource({
        _id: objectId,
        datasetId: objectId,
        name: 'spec.md',
        type: DatasetCollectionTypeEnum.file
      }),
      buildCollectionAuditResource({
        _id: objectId,
        datasetId: objectId,
        name: 'Dir',
        type: DatasetCollectionTypeEnum.folder
      }),
      buildSkillAuditResource({ _id: objectId, name: 'Skill', type: AgentSkillTypeEnum.skill }),
      buildSkillAuditResource({
        _id: objectId,
        name: 'SkillDir',
        type: AgentSkillTypeEnum.folder
      }),
      buildEntityAuditResource({
        type: AuditResourceTypeEnum.enterprise,
        name: 'Acme Corp'
      })!,
      buildEntityAuditResource({
        type: AuditResourceTypeEnum.apiKey,
        id: objectId,
        name: 'Prod Key',
        deleted: true
      })!
    ];

    const audit = new MongoTeamAudit({
      teamId: objectId,
      tmbId: objectId,
      event: AuditEventEnum.LOGIN,
      resources: structured
    });
    await expect(audit.validate()).resolves.toBeUndefined();
    expect(audit.toObject().resources?.[1].type).toBe(AuditResourceTypeEnum.tool);
    expect(audit.toObject().resources?.[2].type).toBe(AuditResourceTypeEnum.appFolder);
    expect(audit.toObject().resources?.[3].type).toBe(AuditResourceTypeEnum.toolFolder);
    expect(audit.toObject().resources?.[6].collectionType).toBe(DatasetCollectionTypeEnum.file);
    expect(audit.toObject().resources?.[7].type).toBe(AuditResourceTypeEnum.collectionFolder);
    expect(audit.toObject().resources?.[10]).toEqual({
      type: AuditResourceTypeEnum.enterprise,
      name: 'Acme Corp'
    });
    expect(audit.toObject().resources?.[11].deleted).toBe(true);

    expect(buildEntityAuditResource({ type: AuditResourceTypeEnum.member, name: '   ' })).toBeUndefined();

    expect(
      normalizeStoredAuditResources([
        { appId: objectId },
        { appId: objectId, appType: AppTypeEnum.workflowTool },
        { datasetId: objectId },
        { skillId: objectId },
        {
          collectionId: objectId,
          datasetId: objectId,
          collectionType: DatasetCollectionTypeEnum.folder
        }
      ])
    ).toEqual([
      { type: AuditResourceTypeEnum.app, id: objectId },
      { type: AuditResourceTypeEnum.tool, id: objectId },
      { type: AuditResourceTypeEnum.dataset, id: objectId },
      { type: AuditResourceTypeEnum.skill, id: objectId },
      {
        type: AuditResourceTypeEnum.collectionFolder,
        id: objectId,
        parentId: objectId,
        collectionType: DatasetCollectionTypeEnum.folder
      }
    ]);

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
    { type: 'unknown', id: objectId },
    { type: AuditResourceTypeEnum.app },
    { type: AuditResourceTypeEnum.app, name: '   ' },
    { type: AuditResourceTypeEnum.collection, id: objectId, parentId: 'invalid-id' },
    { type: AuditResourceTypeEnum.collection, id: objectId, collectionType: 'invalid-type' },
    { type: AuditResourceTypeEnum.app, id: objectId, unknownField: 'bad' }
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
