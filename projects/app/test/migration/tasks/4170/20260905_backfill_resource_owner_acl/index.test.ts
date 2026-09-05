import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationProgressInput
} from '@fastgpt/global/migration/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { backfillResourceOwnerAcl } from '@/migration/tasks/4170/20260905_backfill_resource_owner_acl';
import type { SystemMigrationContext } from '@/migration/registry';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createContext = ({
  beforeSaveCheckpoint
}: {
  beforeSaveCheckpoint?: (callCount: number) => Promise<void>;
} = {}) => {
  let checkpoint: Record<string, unknown> | undefined;
  let failedRecords: SystemMigrationFailedRecord[] = [];
  const progress: SystemMigrationProgressInput[] = [];
  let saveCheckpointCallCount = 0;

  const context = {
    migrationId: '20260905_backfill_resource_owner_acl',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    getFailedRecords: async () => structuredClone(failedRecords),
    reportFailedRecords: vi.fn(async (records: SystemMigrationFailedRecord[]) => {
      failedRecords = structuredClone(records);
    }),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      saveCheckpointCallCount += 1;
      await beforeSaveCheckpoint?.(saveCheckpointCallCount);
      checkpoint = structuredClone(value);
    }),
    reportProgress: vi.fn(async (value: SystemMigrationProgressInput) => {
      progress.push(value);
    }),
    assertActive: vi.fn(async () => undefined),
    fail: async (error) => {
      if (error.failedRecords) failedRecords = structuredClone(error.failedRecords);
      throw new Error(error.message);
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  } satisfies SystemMigrationContext;

  return {
    context,
    getCheckpoint: () => checkpoint,
    getFailedRecords: () => failedRecords,
    getProgress: () => progress
  };
};

const createTeam = async ({ createOwnerMember = true } = {}) => {
  const teamId = new Types.ObjectId();
  const ownerUserId = new Types.ObjectId();
  const ownerTmbId = new Types.ObjectId();
  await MongoTeam.collection.insertOne({
    _id: teamId,
    name: 'Owner ACL team',
    ownerId: ownerUserId
  });
  if (createOwnerMember) {
    await MongoTeamMember.collection.insertOne({
      _id: ownerTmbId,
      teamId,
      userId: ownerUserId,
      name: 'Owner'
    });
  }
  return { teamId, ownerUserId, ownerTmbId };
};

const findOwnerPermission = ({
  teamId,
  resourceType,
  resourceId,
  tmbId
}: {
  teamId: Types.ObjectId;
  resourceType: PerResourceTypeEnum;
  resourceId: Types.ObjectId;
  tmbId: Types.ObjectId;
}) => MongoResourcePermission.collection.findOne({ teamId, resourceType, resourceId, tmbId });

describe('4170 resource owner ACL migration', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([
      MongoApp.collection.deleteMany({}),
      MongoDataset.collection.deleteMany({}),
      MongoAgentSkills.collection.deleteMany({}),
      MongoResourcePermission.collection.deleteMany({}),
      MongoTeamMember.collection.deleteMany({}),
      MongoTeam.collection.deleteMany({})
    ]);
  });

  it('checks every resource type while preserving resources that already have a valid owner', async () => {
    const { teamId, ownerTmbId } = await createTeam();
    const otherUserId = new Types.ObjectId();
    const otherTmbId = new Types.ObjectId();
    await MongoTeamMember.collection.insertOne({
      _id: otherTmbId,
      teamId,
      userId: otherUserId,
      name: 'Other member'
    });
    const appId = new Types.ObjectId();
    const deletedFolderId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const skillId = new Types.ObjectId();
    const groupId = new Types.ObjectId();
    await MongoApp.collection.insertMany([
      { _id: appId, teamId, tmbId: otherTmbId, name: 'App', type: AppTypeEnum.workflow },
      {
        _id: deletedFolderId,
        teamId,
        tmbId: otherTmbId,
        name: 'Deleted folder',
        type: AppTypeEnum.folder,
        deleteTime: new Date()
      }
    ]);
    await MongoDataset.collection.insertOne({
      _id: datasetId,
      teamId,
      tmbId: otherTmbId,
      name: 'Dataset',
      type: DatasetTypeEnum.dataset
    });
    await MongoAgentSkills.collection.insertOne({
      _id: skillId,
      teamId,
      tmbId: otherTmbId,
      name: 'Skill',
      type: AgentSkillTypeEnum.skill
    });
    await MongoResourcePermission.collection.insertMany([
      {
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: appId,
        tmbId: new Types.ObjectId(),
        permission: OwnerRoleVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: datasetId,
        tmbId: ownerTmbId,
        permission: ReadRoleVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: datasetId,
        groupId,
        permission: ReadRoleVal
      },
      {
        teamId,
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: skillId,
        tmbId: otherTmbId,
        permission: OwnerRoleVal
      }
    ]);

    const state = createContext();
    await expect(backfillResourceOwnerAcl(state.context)).resolves.toEqual({
      appsProcessedCount: 2,
      datasetsProcessedCount: 1,
      agentSkillsProcessedCount: 1
    });

    await expect(
      findOwnerPermission({
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: appId,
        tmbId: ownerTmbId
      })
    ).resolves.toMatchObject({ permission: OwnerRoleVal });
    await expect(
      findOwnerPermission({
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: deletedFolderId,
        tmbId: ownerTmbId
      })
    ).resolves.toMatchObject({ permission: OwnerRoleVal });
    await expect(
      findOwnerPermission({
        teamId,
        resourceType: PerResourceTypeEnum.dataset,
        resourceId: datasetId,
        tmbId: ownerTmbId
      })
    ).resolves.toMatchObject({ permission: OwnerRoleVal });
    await expect(
      findOwnerPermission({
        teamId,
        resourceType: PerResourceTypeEnum.agentSkill,
        resourceId: skillId,
        tmbId: ownerTmbId
      })
    ).resolves.toBeNull();
    await expect(
      MongoResourcePermission.collection.findOne({ resourceId: datasetId, groupId })
    ).resolves.toMatchObject({ permission: ReadRoleVal });
    expect(state.getFailedRecords()).toEqual([]);
    expect(state.getProgress().map(({ key, status }) => `${key}:${status}`)).toEqual([
      'apps:running',
      'apps:running',
      'apps:succeeded',
      'datasets:running',
      'datasets:running',
      'datasets:succeeded',
      'agent_skills:running',
      'agent_skills:running',
      'agent_skills:succeeded',
      'validation:running',
      'validation:succeeded'
    ]);
  });

  it('is idempotent when the complete migration runs again', async () => {
    const { teamId, ownerTmbId } = await createTeam();
    const appId = new Types.ObjectId();
    await MongoApp.collection.insertOne({ _id: appId, teamId, name: 'App' });

    await backfillResourceOwnerAcl(createContext().context);
    await expect(backfillResourceOwnerAcl(createContext().context)).resolves.toMatchObject({
      appsProcessedCount: 1
    });

    await expect(
      MongoResourcePermission.collection.countDocuments({
        teamId,
        resourceType: PerResourceTypeEnum.app,
        resourceId: appId,
        tmbId: ownerTmbId
      })
    ).resolves.toBe(1);
  });

  it('replays safely after the ACL write succeeds but checkpoint persistence fails', async () => {
    const { teamId, ownerTmbId } = await createTeam();
    const appId = new Types.ObjectId();
    await MongoApp.collection.insertOne({ _id: appId, teamId, name: 'Replay App' });
    const state = createContext({
      beforeSaveCheckpoint: async (callCount) => {
        if (callCount === 2) throw new Error('checkpoint unavailable');
      }
    });

    await expect(backfillResourceOwnerAcl(state.context)).rejects.toThrow('checkpoint unavailable');
    await expect(backfillResourceOwnerAcl(state.context)).resolves.toMatchObject({
      appsProcessedCount: 1
    });
    await expect(
      MongoResourcePermission.collection.countDocuments({
        teamId,
        resourceId: appId,
        tmbId: ownerTmbId
      })
    ).resolves.toBe(1);
  });

  it('keeps a structured failure until the missing team owner membership is repaired', async () => {
    const { teamId, ownerUserId, ownerTmbId } = await createTeam({ createOwnerMember: false });
    const appId = new Types.ObjectId();
    await MongoApp.collection.insertOne({ _id: appId, teamId, name: 'Broken App' });
    const state = createContext();

    await expect(backfillResourceOwnerAcl(state.context)).rejects.toThrow(
      '1 resources still lack a valid member Owner ACL'
    );
    expect(state.getFailedRecords()).toEqual([
      expect.objectContaining({
        stageKey: 'apps',
        data: expect.objectContaining({
          resourceType: PerResourceTypeEnum.app,
          resourceId: String(appId),
          teamId: String(teamId)
        }),
        reason: { message: 'Resource team owner has no team member record' }
      })
    ]);

    await MongoTeamMember.collection.insertOne({
      _id: ownerTmbId,
      teamId,
      userId: ownerUserId,
      name: 'Repaired owner'
    });
    await expect(backfillResourceOwnerAcl(state.context)).resolves.toMatchObject({
      appsProcessedCount: 1
    });
    expect(state.getFailedRecords()).toEqual([]);
  });

  it('clears a saved failure when the resource was deleted before retry', async () => {
    const { teamId } = await createTeam({ createOwnerMember: false });
    const appId = new Types.ObjectId();
    await MongoApp.collection.insertOne({ _id: appId, teamId, name: 'Deleted broken App' });
    const state = createContext();

    await expect(backfillResourceOwnerAcl(state.context)).rejects.toThrow(
      '1 resources still lack a valid member Owner ACL'
    );
    await MongoApp.collection.deleteOne({ _id: appId });

    await expect(backfillResourceOwnerAcl(state.context)).resolves.toMatchObject({
      appsProcessedCount: 1
    });
    expect(state.getFailedRecords()).toEqual([]);
  });

  it('backfills an owner-less resource created after the fixed snapshot', async () => {
    const { teamId, ownerTmbId } = await createTeam();
    const snapshotAppId = new Types.ObjectId();
    const lateAppId = new Types.ObjectId();
    await MongoApp.collection.insertOne({ _id: snapshotAppId, teamId, name: 'Snapshot App' });
    const state = createContext({
      beforeSaveCheckpoint: async (callCount) => {
        if (callCount === 1) {
          await MongoApp.collection.insertOne({ _id: lateAppId, teamId, name: 'Late App' });
        }
      }
    });

    await backfillResourceOwnerAcl(state.context);
    await expect(
      MongoResourcePermission.collection.countDocuments({
        teamId,
        tmbId: ownerTmbId,
        resourceId: { $in: [snapshotAppId, lateAppId] },
        permission: OwnerRoleVal
      })
    ).resolves.toBe(2);
  });

  it('does not start a business write after losing the migration lease', async () => {
    const { teamId } = await createTeam();
    await MongoApp.collection.insertOne({ _id: new Types.ObjectId(), teamId, name: 'Lease App' });
    const state = createContext();
    state.context.assertActive.mockRejectedValue(new Error('lease lost'));
    const updateSpy = vi.spyOn(MongoResourcePermission.collection, 'updateOne');

    await expect(backfillResourceOwnerAcl(state.context)).rejects.toThrow('lease lost');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('reports non-ObjectId resources instead of guessing an ACL reference', async () => {
    const { teamId } = await createTeam();
    await MongoApp.collection.insertOne({
      _id: 'legacy-invalid-app-id' as never,
      teamId,
      name: 'Invalid App'
    });
    const state = createContext();

    await expect(backfillResourceOwnerAcl(state.context)).rejects.toThrow(
      '1 resources still lack a valid member Owner ACL'
    );
    expect(state.getFailedRecords()).toEqual([
      expect.objectContaining({
        stageKey: 'apps',
        data: expect.objectContaining({ resourceId: 'legacy-invalid-app-id' }),
        reason: { message: 'Resource _id is not an ObjectId' }
      })
    ]);
  });
});
