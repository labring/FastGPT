import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { SystemMigrationContext } from '@/migration/registry';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationProgressInput
} from '@fastgpt/global/migration/schema';
import { backfillAgentSandboxTeamId } from '@/migration/tasks/4173/20261009_backfill_agent_sandbox_team_id';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';

vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 2 }));

/** 用内存 Context 模拟持久断点与失败快照；业务写入仍运行真实测试 Mongo 事务。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failedRecords: SystemMigrationFailedRecord[] = [];
  const context = {
    migrationId: '20261009_backfill_agent_sandbox_team_id',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn(async (_value: SystemMigrationProgressInput) => undefined),
    getFailedRecords: vi.fn(async () => failedRecords),
    reportFailedRecords: vi.fn(async (records: SystemMigrationFailedRecord[]) => {
      failedRecords = records;
    }),
    fail: vi.fn(async (input: { failedRecords?: SystemMigrationFailedRecord[] }) => {
      failedRecords = input.failedRecords ?? failedRecords;
      throw new Error('migration failed');
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, getCheckpoint: () => checkpoint, getFailedRecords: () => failedRecords };
};

const seedApp = async (teamId?: Types.ObjectId, deleteTime: Date | null = null) => {
  const { insertedId } = await MongoApp.collection.insertOne({
    _id: new Types.ObjectId(),
    name: 'app',
    ...(teamId ? { teamId } : {}),
    deleteTime
  });
  return insertedId as Types.ObjectId;
};

const seedSkill = async (teamId?: Types.ObjectId, deleteTime: Date | null = null) => {
  const { insertedId } = await MongoAgentSkills.collection.insertOne({
    _id: new Types.ObjectId(),
    name: 'skill',
    ...(teamId ? { teamId } : {}),
    deleteTime
  });
  return insertedId as Types.ObjectId;
};

const seedSandbox = async (params: {
  sourceType: 'app' | 'skillEdit';
  sourceId: Types.ObjectId;
  teamId?: Types.ObjectId;
  id?: Types.ObjectId;
}) => {
  const _id = params.id ?? new Types.ObjectId();
  await MongoSandboxInstance.collection.insertOne({
    _id,
    provider: 'opensandbox',
    sandboxId: `skilledit-${String(_id).slice(-16)}`,
    sourceType: params.sourceType,
    sourceId: String(params.sourceId),
    // 逻辑身份唯一键为 (sourceType, sourceId, userId)：app 沙箱按用户区分。
    userId: params.sourceType === 'app' ? `user-${getNanoid()}` : 'skillEdit',
    status: 'stopped',
    lastActiveAt: new Date(),
    createdAt: new Date(),
    ...(params.teamId ? { teamId: String(params.teamId) } : {})
  });
  return _id;
};

const readSandboxTeamId = async (id: Types.ObjectId) => {
  const doc = await MongoSandboxInstance.collection.findOne(
    { _id: id },
    { projection: { _id: 0, teamId: 1 } }
  );
  return doc?.teamId;
};

describe('backfillAgentSandboxTeamId', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await MongoSandboxInstance.collection.deleteMany({});
    await MongoApp.collection.deleteMany({});
    await MongoAgentSkills.collection.deleteMany({});
  });

  it('backfills app and skill instances from their sources', async () => {
    const appTeamId = new Types.ObjectId();
    const skillTeamId = new Types.ObjectId();
    const appId = await seedApp(appTeamId);
    const skillId = await seedSkill(skillTeamId);
    const firstId = await seedSandbox({ sourceType: 'app', sourceId: appId });
    const secondId = await seedSandbox({ sourceType: 'app', sourceId: appId });
    const skillSandboxId = await seedSandbox({ sourceType: 'skillEdit', sourceId: skillId });

    const { context } = createContext();
    await expect(backfillAgentSandboxTeamId(context)).resolves.toEqual({
      scannedCount: 3,
      backfilledCount: 3,
      orphanCount: 0
    });

    expect(await readSandboxTeamId(firstId)).toBe(String(appTeamId));
    expect(await readSandboxTeamId(secondId)).toBe(String(appTeamId));
    expect(await readSandboxTeamId(skillSandboxId)).toBe(String(skillTeamId));
    expect(context.fail).not.toHaveBeenCalled();
    expect(context.reportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'validation', status: 'succeeded' })
    );
  });

  it('reports invalid sourceId while backfilling valid records and retries after repair', async () => {
    const sourceType = 'app' as const;
    const teamId = new Types.ObjectId();
    const sourceId = await seedApp(teamId);
    const validSourceId = await seedApp(teamId);
    const invalidId = await seedSandbox({ sourceType, sourceId });
    const validId = await seedSandbox({ sourceType, sourceId: validSourceId });
    await MongoSandboxInstance.collection.updateOne(
      { _id: invalidId },
      { $set: { sourceId: 'invalid-source-id' } }
    );

    const { context, getCheckpoint, getFailedRecords } = createContext();
    await expect(backfillAgentSandboxTeamId(context)).rejects.toThrow('migration failed');

    expect(await readSandboxTeamId(validId)).toBe(String(teamId));
    expect(await readSandboxTeamId(invalidId)).toBeUndefined();
    expect(getCheckpoint()).toMatchObject({
      scannedCount: 3,
      backfilledCount: 1,
      lastId: null,
      reconciled: false
    });
    expect(getFailedRecords()).toEqual([
      {
        stageKey: 'validation',
        data: { recordId: String(invalidId), sourceType, sourceId: 'invalid-source-id' },
        reason: { message: 'Sandbox sourceId is not a valid ObjectId' }
      }
    ]);

    await MongoSandboxInstance.collection.updateOne(
      { _id: invalidId },
      { $set: { sourceId: String(sourceId) } }
    );
    await expect(backfillAgentSandboxTeamId(context)).resolves.toMatchObject({
      scannedCount: 3,
      backfilledCount: 2
    });
    expect(await readSandboxTeamId(invalidId)).toBe(String(teamId));
    expect(getFailedRecords()).toEqual([]);
  });

  it('skips orphan records without failing the migration', async () => {
    const missingId = await seedSandbox({
      sourceType: 'app',
      sourceId: new Types.ObjectId()
    });
    const deletedAppId = await seedApp(new Types.ObjectId(), new Date());
    const deletedId = await seedSandbox({ sourceType: 'app', sourceId: deletedAppId });

    const { context } = createContext();
    await expect(backfillAgentSandboxTeamId(context)).resolves.toEqual({
      scannedCount: 4,
      backfilledCount: 0,
      orphanCount: 2
    });

    expect(await readSandboxTeamId(missingId)).toBeUndefined();
    expect(await readSandboxTeamId(deletedId)).toBeUndefined();
    expect(context.fail).not.toHaveBeenCalled();
    expect(context.reportFailedRecords).toHaveBeenCalledWith([]);
  });

  it('reports a source without teamId and succeeds after the source is repaired', async () => {
    const appId = await seedApp();
    const sandboxId = await seedSandbox({ sourceType: 'app', sourceId: appId });

    const { context, getFailedRecords } = createContext();
    await expect(backfillAgentSandboxTeamId(context)).rejects.toThrow('migration failed');
    expect(context.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        failedRecords: [
          expect.objectContaining({
            stageKey: 'validation',
            data: expect.objectContaining({
              recordId: String(sandboxId),
              sourceType: 'app',
              sourceId: String(appId)
            })
          })
        ]
      })
    );
    expect(await readSandboxTeamId(sandboxId)).toBeUndefined();

    // 管理员修复 source 后重试：失败快照先被重新处理。
    const repairedTeamId = new Types.ObjectId();
    await MongoApp.collection.updateOne({ _id: appId }, { $set: { teamId: repairedTeamId } });
    expect(getFailedRecords()).toHaveLength(1);

    await expect(backfillAgentSandboxTeamId(context)).resolves.toMatchObject({
      scannedCount: 2,
      backfilledCount: 1
    });
    expect(await readSandboxTeamId(sandboxId)).toBe(String(repairedTeamId));
    expect(getFailedRecords()).toHaveLength(0);
  });

  it('never overwrites an ownership written concurrently and is replay idempotent', async () => {
    const appTeamId = new Types.ObjectId();
    const concurrentTeamId = new Types.ObjectId();
    const appId = await seedApp(appTeamId);
    const missingId = await seedSandbox({ sourceType: 'app', sourceId: appId });
    const concurrentId = await seedSandbox({ sourceType: 'app', sourceId: appId });
    const bulkWrite = MongoSandboxInstance.collection.bulkWrite.bind(
      MongoSandboxInstance.collection
    );
    vi.spyOn(MongoSandboxInstance.collection, 'bulkWrite').mockImplementationOnce(
      async (ops, options) => {
        await MongoSandboxInstance.collection.updateOne(
          { _id: concurrentId },
          { $set: { teamId: String(concurrentTeamId) } }
        );
        return bulkWrite(ops, options);
      }
    );

    const { context } = createContext();
    await expect(backfillAgentSandboxTeamId(context)).resolves.toMatchObject({
      scannedCount: 2,
      backfilledCount: 2
    });
    expect(await readSandboxTeamId(missingId)).toBe(String(appTeamId));
    expect(await readSandboxTeamId(concurrentId)).toBe(String(concurrentTeamId));

    await expect(backfillAgentSandboxTeamId(context)).resolves.toMatchObject({
      scannedCount: 2,
      backfilledCount: 2
    });
    expect(await readSandboxTeamId(concurrentId)).toBe(String(concurrentTeamId));
  });

  it('resumes from checkpoint after a crash mid-batch', async () => {
    const teamId = new Types.ObjectId();
    const appId = await seedApp(teamId);
    const firstId = await seedSandbox({ sourceType: 'app', sourceId: appId });
    await seedSandbox({ sourceType: 'app', sourceId: appId });
    const thirdId = await seedSandbox({ sourceType: 'app', sourceId: appId });

    const { context, getCheckpoint } = createContext();
    const originalBulkWrite = MongoSandboxInstance.collection.bulkWrite.bind(
      MongoSandboxInstance.collection
    );
    const bulkWriteSpy = vi
      .spyOn(MongoSandboxInstance.collection, 'bulkWrite')
      .mockImplementation(async (ops, options) => {
        if (JSON.stringify(ops).includes(String(thirdId))) throw new Error('crash');
        return originalBulkWrite(ops, options);
      });

    await expect(backfillAgentSandboxTeamId(context)).rejects.toThrow('crash');
    expect(getCheckpoint()).toMatchObject({ scannedCount: 2, backfilledCount: 2 });
    expect(await readSandboxTeamId(firstId)).toBe(String(teamId));
    expect(await readSandboxTeamId(thirdId)).toBeUndefined();
    bulkWriteSpy.mockRestore();

    await expect(backfillAgentSandboxTeamId(context)).resolves.toMatchObject({
      scannedCount: 3,
      backfilledCount: 3
    });
    expect(await readSandboxTeamId(thirdId)).toBe(String(teamId));
  });

  it('reconciles late records added during scanning', async () => {
    const teamId = new Types.ObjectId();
    const appId = await seedApp(teamId);
    const firstId = await seedSandbox({
      sourceType: 'app',
      sourceId: appId,
      id: new Types.ObjectId('000000000000000000000200')
    });
    const lateId = '000000000000000000000100';
    const { context } = createContext();
    const saveCheckpoint = context.saveCheckpoint.getMockImplementation()!;
    let inserted = false;
    context.saveCheckpoint.mockImplementation(async (checkpoint) => {
      await saveCheckpoint(checkpoint);
      if (!inserted && checkpoint.lastId === String(firstId)) {
        inserted = true;
        await seedSandbox({ sourceType: 'app', sourceId: appId, id: new Types.ObjectId(lateId) });
      }
    });

    await expect(backfillAgentSandboxTeamId(context)).resolves.toEqual({
      scannedCount: 2,
      backfilledCount: 2,
      orphanCount: 0
    });
    expect(await readSandboxTeamId(new Types.ObjectId(lateId))).toBe(String(teamId));
  });

  it('fails validation for backfillable leftovers and resets the scan for retry', async () => {
    const teamId = new Types.ObjectId();
    const appId = await seedApp(teamId);
    await seedSandbox({ sourceType: 'app', sourceId: appId });
    const { context, getCheckpoint, getFailedRecords } = createContext();
    let lateId: Types.ObjectId;
    context.reportProgress.mockImplementation(async (progress) => {
      if (progress.key === 'validation' && progress.status === 'running' && !lateId) {
        lateId = await seedSandbox({
          sourceType: 'app',
          sourceId: appId,
          id: new Types.ObjectId('000000000000000000000200')
        });
      }
    });

    await expect(backfillAgentSandboxTeamId(context)).rejects.toThrow('migration failed');
    expect(getCheckpoint()).toMatchObject({ lastId: null, reconciled: false });
    expect(await readSandboxTeamId(lateId!)).toBeUndefined();
    expect(getFailedRecords()).toEqual([
      expect.objectContaining({
        stageKey: 'validation',
        data: expect.objectContaining({ recordId: String(lateId!) })
      })
    ]);
    expect(context.reportProgress).not.toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
    });

    // 验证重试确实从头扫描，而非只修复失败列表或继续扫描更大的 ID。
    const earlierId = await seedSandbox({
      sourceType: 'app',
      sourceId: appId,
      id: new Types.ObjectId('000000000000000000000100')
    });
    await expect(backfillAgentSandboxTeamId(context)).resolves.toMatchObject({
      backfilledCount: 3
    });
    expect(await readSandboxTeamId(lateId!)).toBe(String(teamId));
    expect(await readSandboxTeamId(earlierId)).toBe(String(teamId));
    expect(getFailedRecords()).toEqual([]);
  });
});
