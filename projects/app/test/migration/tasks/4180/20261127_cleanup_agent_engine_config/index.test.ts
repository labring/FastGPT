import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  MongoSystemMigrationFailedRecord,
  MongoSystemMigrationState
} from '@/migration/mongoSchema';
import {
  systemMigrations,
  type SystemMigration,
  type SystemMigrationContext
} from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import { getSystemMigrationList } from '@/migration/service';
import { cleanupAgentEngineConfig } from '@/migration/tasks/4180/20261127_cleanup_agent_engine_config';

const MIGRATION_ID = '20261127_cleanup_agent_engine_config';

const createTestContext = (signal?: AbortSignal) => {
  let failures: SystemMigrationFailedRecord[] = [];
  const context = {
    migrationId: MIGRATION_ID,
    runId: 'test-run-id',
    signal: signal ?? new AbortController().signal,
    getCheckpoint: vi.fn(async () => undefined),
    saveCheckpoint: vi.fn(async () => undefined),
    getFailedRecords: vi.fn(async () => structuredClone(failures)),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async () => undefined),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;

  return { context, failures: () => failures };
};

/** 绕过现行严格 Schema 写入历史遗留脏记录，模拟 4.17 或早期 4.18 环境存量文档。 */
const seedRawInstanceConfigDoc = async (doc: {
  _id?: string;
  domain?: string;
  revision: number;
  overrides: Record<string, unknown>;
  explicitDefaultPaths?: string[];
  updatedAt?: Date;
}) => {
  const now = doc.updatedAt ?? new Date('2026-11-01T00:00:00.000Z');
  await MongoSystemInstanceConfig.collection.insertOne({
    ...(doc._id !== undefined ? { _id: doc._id } : {}),
    ...(doc.domain !== undefined ? { domain: doc.domain } : {}),
    schemaVersion: 1,
    revision: doc.revision,
    overrides: doc.overrides,
    ...(doc.explicitDefaultPaths !== undefined
      ? { explicitDefaultPaths: doc.explicitDefaultPaths }
      : {}),
    updatedBy: { actor: 'admin' },
    createdAt: now,
    updatedAt: now
  } as any);
};

describe('20261127_cleanup_agent_engine_config', () => {
  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
    await MongoSystemMigrationState.deleteMany({ _id: MIGRATION_ID });
    await MongoSystemMigrationFailedRecord.deleteMany({ migrationId: MIGRATION_ID });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cleans both overrides.agentEngine and explicitDefaultPaths markers while preserving other feature settings and unrelated domains', async () => {
    const initialTime = new Date('2026-11-01T00:00:00.000Z');
    await seedRawInstanceConfigDoc({
      domain: 'feature',
      revision: 2,
      overrides: {
        agentEngine: 'piAgent',
        multipleDataToBase64: true,
        enableTeamModel: true
      },
      explicitDefaultPaths: ['agentEngine', 'showDatasetFeishu'],
      updatedAt: initialTime
    });
    await seedRawInstanceConfigDoc({
      domain: 'security',
      revision: 5,
      overrides: { csrfEnabled: true },
      explicitDefaultPaths: ['checkExternalFile'],
      updatedAt: initialTime
    });

    const { context } = createTestContext();
    const result = await cleanupAgentEngineConfig(context);

    expect(result).toEqual({
      cleanedDocumentCount: 1,
      removedFieldCount: 2
    });

    const featureDoc = await MongoSystemInstanceConfig.collection.findOne({ domain: 'feature' });
    expect(featureDoc).toMatchObject({
      domain: 'feature',
      revision: 3,
      overrides: {
        multipleDataToBase64: true,
        enableTeamModel: true
      },
      explicitDefaultPaths: ['showDatasetFeishu']
    });
    expect(featureDoc?.overrides).not.toHaveProperty('agentEngine');
    expect((featureDoc?.updatedAt as Date).getTime()).toBeGreaterThan(initialTime.getTime());

    // 其他配置域不得被误修改或递增 revision
    const securityDoc = await MongoSystemInstanceConfig.collection.findOne({ domain: 'security' });
    expect(securityDoc).toMatchObject({
      domain: 'security',
      revision: 5,
      overrides: { csrfEnabled: true },
      explicitDefaultPaths: ['checkExternalFile'],
      updatedAt: initialTime
    });
  });

  it('cleans documents containing only overrides.agentEngine or only explicitDefaultPaths markers (including legacy string _id)', async () => {
    // 1. 仅存在 overrides.agentEngine（且无 explicitDefaultPaths 字段）
    await seedRawInstanceConfigDoc({
      domain: 'feature',
      revision: 0,
      overrides: {
        agentEngine: 'fastAgent',
        multipleDataToBase64: false
      }
    });

    const firstRun = await cleanupAgentEngineConfig(createTestContext().context);
    expect(firstRun).toEqual({ cleanedDocumentCount: 1, removedFieldCount: 1 });

    const afterOverrideOnly = await MongoSystemInstanceConfig.collection.findOne({
      domain: 'feature'
    });
    expect(afterOverrideOnly?.revision).toBe(1);
    expect(afterOverrideOnly?.overrides).toEqual({ multipleDataToBase64: false });
    expect(afterOverrideOnly).not.toHaveProperty('explicitDefaultPaths');

    // 2. 仅存在 explicitDefaultPaths: ['agentEngine', ...]
    await MongoSystemInstanceConfig.deleteMany({});
    await seedRawInstanceConfigDoc({
      domain: 'feature',
      revision: 4,
      overrides: { enableTeamModel: true },
      explicitDefaultPaths: ['agentEngine', 'multipleDataToBase64']
    });

    const secondRun = await cleanupAgentEngineConfig(createTestContext().context);
    expect(secondRun).toEqual({ cleanedDocumentCount: 1, removedFieldCount: 1 });

    const afterMarkerOnly = await MongoSystemInstanceConfig.collection.findOne({
      domain: 'feature'
    });
    expect(afterMarkerOnly?.revision).toBe(5);
    expect(afterMarkerOnly?.overrides).toEqual({ enableTeamModel: true });
    expect(afterMarkerOnly?.explicitDefaultPaths).toEqual(['multipleDataToBase64']);

    // 3. 兼容早期以字符串 'feature' 作为 _id 且无 domain 字段的文档
    await MongoSystemInstanceConfig.deleteMany({});
    await seedRawInstanceConfigDoc({
      _id: 'feature',
      revision: 1,
      overrides: { agentEngine: 'piAgent', showPublishWechat: true },
      explicitDefaultPaths: ['agentEngine']
    });

    const legacyIdRun = await cleanupAgentEngineConfig(createTestContext().context);
    expect(legacyIdRun).toEqual({ cleanedDocumentCount: 1, removedFieldCount: 2 });
    const legacyDoc = await MongoSystemInstanceConfig.collection.findOne({
      _id: 'feature'
    } as any);
    expect(legacyDoc?.revision).toBe(2);
    expect(legacyDoc?.overrides).toEqual({ showPublishWechat: true });
    expect(legacyDoc?.explicitDefaultPaths).toEqual([]);
  });

  it('replays idempotently without rewriting or incrementing revision on subsequent runs', async () => {
    await seedRawInstanceConfigDoc({
      domain: 'feature',
      revision: 3,
      overrides: { agentEngine: 'piAgent', multipleDataToBase64: true },
      explicitDefaultPaths: ['agentEngine', 'enableTeamModel']
    });

    const firstResult = await cleanupAgentEngineConfig(createTestContext().context);
    expect(firstResult).toEqual({ cleanedDocumentCount: 1, removedFieldCount: 2 });

    const snapshotAfterFirst = await MongoSystemInstanceConfig.collection.findOne({
      domain: 'feature'
    });
    expect(snapshotAfterFirst?.revision).toBe(4);

    const secondContext = createTestContext().context;
    const secondResult = await cleanupAgentEngineConfig(secondContext);
    expect(secondResult).toEqual({ cleanedDocumentCount: 0, removedFieldCount: 0 });

    const snapshotAfterSecond = await MongoSystemInstanceConfig.collection.findOne({
      domain: 'feature'
    });
    expect(snapshotAfterSecond).toEqual(snapshotAfterFirst);
  });

  it('skips read-only when collection is empty or feature document has no residual agentEngine', async () => {
    // 空集合直接跳过
    const emptyResult = await cleanupAgentEngineConfig(createTestContext().context);
    expect(emptyResult).toEqual({ cleanedDocumentCount: 0, removedFieldCount: 0 });
    expect(await MongoSystemInstanceConfig.countDocuments({})).toBe(0);

    // 已干净的 feature 文档绝不写库或递增 revision
    const fixedTime = new Date('2026-11-10T08:00:00.000Z');
    await seedRawInstanceConfigDoc({
      domain: 'feature',
      revision: 7,
      overrides: { multipleDataToBase64: true },
      explicitDefaultPaths: ['enableTeamModel'],
      updatedAt: fixedTime
    });

    const updateSpy = vi.spyOn(MongoSystemInstanceConfig.collection, 'updateOne');
    const cleanResult = await cleanupAgentEngineConfig(createTestContext().context);

    expect(cleanResult).toEqual({ cleanedDocumentCount: 0, removedFieldCount: 0 });
    expect(updateSpy).not.toHaveBeenCalled();

    const doc = await MongoSystemInstanceConfig.collection.findOne({ domain: 'feature' });
    expect(doc?.revision).toBe(7);
    expect(doc?.updatedAt).toEqual(fixedTime);
  });

  it('reports running -> succeeded progress for cleanup and validation without saving checkpoints and integrates with runner list DTO', async () => {
    await seedRawInstanceConfigDoc({
      domain: 'feature',
      revision: 1,
      overrides: { agentEngine: 'piAgent', multipleDataToBase64: true },
      explicitDefaultPaths: ['agentEngine']
    });

    const { context } = createTestContext();
    const result = await cleanupAgentEngineConfig(context);

    expect(result).toEqual({ cleanedDocumentCount: 1, removedFieldCount: 2 });
    expect(context.saveCheckpoint).not.toHaveBeenCalled();
    expect(context.assertActive).toHaveBeenCalled();
    expect(context.reportProgress.mock.calls.map(([input]) => input)).toEqual([
      { key: 'cleanup', status: SystemMigrationStatusEnum.running },
      {
        key: 'cleanup',
        status: SystemMigrationStatusEnum.succeeded,
        current: 1,
        total: 1
      },
      { key: 'validation', status: SystemMigrationStatusEnum.running },
      { key: 'validation', status: SystemMigrationStatusEnum.succeeded }
    ]);

    // 验证通过真实 Runner 执行与列表组装结果模板
    await MongoSystemInstanceConfig.collection.updateOne(
      { domain: 'feature' },
      { $set: { 'overrides.agentEngine': 'piAgent' } }
    );

    const registered = systemMigrations.find(({ id }) => id === MIGRATION_ID);
    expect(registered).toBeDefined();
    const miniRegistry: readonly SystemMigration[] = [registered!];

    vi.spyOn(redisCacheAdapter, 'evalScript').mockResolvedValue(1);
    const runner = createSystemMigrationRunner({
      migrations: miniRegistry,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    });
    try {
      await runner.start();
      await runner.waitForBlockingMigrations();
      runner.startBackgroundMigrations();
      await runner.tick();
    } finally {
      runner.stop();
    }

    const list = await getSystemMigrationList(miniRegistry);
    expect(list.migrations[0]).toMatchObject({
      id: MIGRATION_ID,
      independent: true,
      blockStartup: false,
      status: SystemMigrationStatusEnum.succeeded,
      result: {
        key: 'system_migration:migrations.20261127_cleanup_agent_engine_config.result',
        params: {
          cleanedDocumentCount: 1,
          removedFieldCount: 1
        }
      }
    });
  });

  it('fails validation without leaking config values if residual agentEngine remains after cleanup', async () => {
    const sensitiveLegacyValue = 'piAgent-sensitive-marker-do-not-leak';
    await seedRawInstanceConfigDoc({
      domain: 'feature',
      revision: 2,
      overrides: { agentEngine: sensitiveLegacyValue, multipleDataToBase64: true }
    });

    // 模拟写操作未生效或校验前被旧进程并发写回残留字段
    vi.spyOn(MongoSystemInstanceConfig.collection, 'updateOne').mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null
    });

    const { context, failures } = createTestContext();
    await expect(cleanupAgentEngineConfig(context)).rejects.toThrow(
      'Legacy feature.agentEngine configuration cleanup validation failed'
    );

    expect(context.fail).toHaveBeenCalledTimes(1);
    expect(failures()).toEqual([
      {
        stageKey: 'validation',
        data: {
          id: expect.any(String),
          domain: 'feature'
        },
        reason: {
          message:
            'Residual feature.agentEngine override or explicitDefaultPaths marker still exists after cleanup'
        }
      }
    ]);
    expect(JSON.stringify(failures())).not.toContain(sensitiveLegacyValue);
    expect(
      context.reportProgress.mock.calls.some(
        ([input]) =>
          input.key === 'validation' && input.status === SystemMigrationStatusEnum.succeeded
      )
    ).toBe(false);
  });
});
