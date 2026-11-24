import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { connectionLogMongo, connectionMongo } from '@fastgpt/service/common/mongo';
import { LEGACY_DEPRECATED_MONGO_INDEXES } from '@fastgpt/service/common/mongo/legacyDeprecatedIndexCleanup';
import {
  createMongoIndexCleanupMigration,
  type DeprecatedMongoIndexMigrationEntry
} from '@/migration/mongoIndexCleanup';
import type { SystemMigrationContext } from '@/migration/registry';
import { cleanupMongoIndexes } from '@/migration/tasks/4180/20261123_cleanup_mongo_indexes';

const createContext = (signal?: AbortSignal) => {
  let failures: SystemMigrationFailedRecord[] = [];
  const context = {
    migrationId: '20261123_cleanup_mongo_indexes',
    runId: 'test-run',
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

const listIndexNames = async (collectionName: string, datasource: 'main' | 'log' = 'main') => {
  const client = datasource === 'log' ? connectionLogMongo : connectionMongo;
  const db = client.connection.db!;
  const exists = await db.listCollections({ name: collectionName }).hasNext();
  if (!exists) return [];
  const indexes = await db.collection(collectionName).indexes();
  return indexes.map((idx) => idx.name);
};

describe('20261123_cleanup_mongo_indexes', () => {
  const originalEnv = process.env.MONGO_DEPRECATE_INDEX;

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.MONGO_DEPRECATE_INDEX;
    } else {
      process.env.MONGO_DEPRECATE_INDEX = originalEnv;
    }
    vi.restoreAllMocks();
  });

  it('drops exact-matching legacy indexes after replacement indexes are ready, preserves customer indexes, and replays idempotently', async () => {
    const mainDb = connectionMongo.connection.db!;
    const logDb = connectionLogMongo.connection.db!;

    // 1. 构造真实历史废弃索引及其声明的前置替代索引（普通、partial unique、TTL 与 log 库索引）
    await mainDb
      .collection('chats')
      .createIndex({ appId: 1, updateTime: -1 }, { name: 'appId_1_updateTime_-1' });
    await mainDb
      .collection('chats')
      .createIndex({ appId: 1, updateTime: -1, _id: -1 }, { name: 'appId_1_updateTime_-1__id_-1' });

    await mainDb.collection('systemConfigs').createIndex(
      { type: 1 },
      {
        name: 'runtime_scope_type_unique',
        unique: true,
        partialFilterExpression: {
          type: {
            $in: [
              SystemConfigsTypeEnum.proEnv,
              SystemConfigsTypeEnum.subPlans,
              SystemConfigsTypeEnum.langfuse
            ]
          }
        }
      }
    );
    await mainDb.collection('systemConfigs').createIndex({ type: 1 }, { name: 'type_1' });

    await mainDb
      .collection('model_status_probe_records')
      .createIndex({ testedAt: 1 }, { name: 'testedAt_1', expireAfterSeconds: 30 * 24 * 60 * 60 });
    await mainDb
      .collection('model_status_probe_records')
      .createIndex(
        { requestEndedAt: 1 },
        { name: 'requestEndedAt_1', expireAfterSeconds: 30 * 24 * 60 * 60 }
      );

    await logDb
      .collection('app_chat_logs')
      .createIndex({ teamId: 1, appId: 1, userId: 1 }, { name: 'teamId_1_appId_1_userId_1' });
    await logDb
      .collection('app_chat_logs')
      .createIndex(
        { teamId: 1, appId: 1, userId: 1, createTime: 1 },
        { name: 'teamId_1_appId_1_userId_1_createTime_1' }
      );

    // 2. 构造客户同名定制索引（加了 unique: true）与客户无关索引，均必须保守保留
    await mainDb
      .collection('datasets')
      .createIndex({ teamId: 1 }, { name: 'teamId_1', unique: true });
    await mainDb
      .collection('chats')
      .createIndex({ customCustomerField: 1 }, { name: 'customer_custom_idx' });

    const first = createContext();
    const firstResult = await cleanupMongoIndexes(first.context);

    expect(firstResult).toEqual({
      totalCount: LEGACY_DEPRECATED_MONGO_INDEXES.length,
      droppedCount: 4,
      missingCount: LEGACY_DEPRECATED_MONGO_INDEXES.length - 5,
      skippedCount: 1
    });
    expect(first.context.saveCheckpoint).not.toHaveBeenCalled();
    expect(first.context.reportProgress).toHaveBeenCalledWith({
      key: 'cleanup',
      status: 'running',
      current: 0,
      total: LEGACY_DEPRECATED_MONGO_INDEXES.length
    });
    expect(first.context.reportProgress).toHaveBeenCalledWith({
      key: 'cleanup',
      status: 'succeeded',
      current: LEGACY_DEPRECATED_MONGO_INDEXES.length,
      total: LEGACY_DEPRECATED_MONGO_INDEXES.length
    });
    expect(first.context.reportProgress).toHaveBeenCalledWith({
      key: 'validation',
      status: 'running'
    });
    expect(first.context.reportProgress).toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
    });

    // 验证四条精确匹配的废弃索引已删除，替代索引与客户索引完好保留
    expect(await listIndexNames('chats')).not.toContain('appId_1_updateTime_-1');
    expect(await listIndexNames('chats')).toContain('appId_1_updateTime_-1__id_-1');
    expect(await listIndexNames('systemConfigs')).not.toContain('runtime_scope_type_unique');
    expect(await listIndexNames('systemConfigs')).toContain('type_1');
    expect(await listIndexNames('model_status_probe_records')).not.toContain('testedAt_1');
    expect(await listIndexNames('model_status_probe_records')).toContain('requestEndedAt_1');
    expect(await listIndexNames('app_chat_logs', 'log')).not.toContain('teamId_1_appId_1_userId_1');
    expect(await listIndexNames('app_chat_logs', 'log')).toContain(
      'teamId_1_appId_1_userId_1_createTime_1'
    );
    expect(await listIndexNames('datasets')).toContain('teamId_1');
    expect(await listIndexNames('chats')).toContain('customer_custom_idx');
    expect(first.context.logger.warn).toHaveBeenCalledWith(
      'Preserved MongoDB index due to definition mismatch',
      expect.objectContaining({
        collection: 'datasets',
        indexName: 'teamId_1'
      })
    );

    // 3. 幂等重放：不报错、不再删除、客户索引仍完好
    const replay = createContext();
    const replayResult = await cleanupMongoIndexes(replay.context);
    expect(replayResult).toEqual({
      totalCount: LEGACY_DEPRECATED_MONGO_INDEXES.length,
      droppedCount: 0,
      missingCount: LEGACY_DEPRECATED_MONGO_INDEXES.length - 1,
      skippedCount: 1
    });
    expect(await listIndexNames('datasets')).toContain('teamId_1');
    expect(await listIndexNames('chats')).toContain('customer_custom_idx');
  });

  it('tracks required replacement index build via polling and drops legacy index only once ready', async () => {
    const collectionName = 'mig_idx_wait_ready_test';
    const db = connectionMongo.connection.db!;
    await db
      .collection(collectionName)
      .createIndex({ appId: 1, updateTime: -1 }, { name: 'appId_1_updateTime_-1' });

    const run = createMongoIndexCleanupMigration({
      entries: [
        {
          collectionName,
          datasource: 'main',
          indexName: 'appId_1_updateTime_-1',
          key: { appId: 1, updateTime: -1 },
          options: {},
          requiredIndexes: [{ key: { appId: 1, updateTime: -1, _id: -1 }, options: {} }],
          reason: 'wait for replacement build'
        }
      ],
      pollIntervalMs: 25,
      prerequisiteWaitTimeoutMs: 2_000
    });

    const { context } = createContext();
    let seenLegacyWhileWaiting = false;

    const migrationPromise = run(context);
    await new Promise((resolve) => setTimeout(resolve, 60));
    // 替代索引未就绪期间，旧索引必须依然存在
    seenLegacyWhileWaiting = (await listIndexNames(collectionName)).includes(
      'appId_1_updateTime_-1'
    );

    // 模拟后台建索引完成
    await db
      .collection(collectionName)
      .createIndex({ appId: 1, updateTime: -1, _id: -1 }, { name: 'appId_1_updateTime_-1__id_-1' });

    const result = await migrationPromise;
    expect(seenLegacyWhileWaiting).toBe(true);
    expect(result).toEqual({
      totalCount: 1,
      droppedCount: 1,
      missingCount: 0,
      skippedCount: 0
    });
    expect(await listIndexNames(collectionName)).not.toContain('appId_1_updateTime_-1');
    expect(await listIndexNames(collectionName)).toContain('appId_1_updateTime_-1__id_-1');
  });

  it('keeps legacy index and fails when required replacement index is missing or only partial, then succeeds after real replacement is built', async () => {
    const collectionName = 'mig_idx_missing_replacement_test';
    const db = connectionMongo.connection.db!;
    await db
      .collection(collectionName)
      .createIndex({ appId: 1, updateTime: -1 }, { name: 'appId_1_updateTime_-1' });
    // 同 key 但带 partialFilterExpression 的受限索引不得被误判为全量替代索引
    await db.collection(collectionName).createIndex(
      { appId: 1, updateTime: -1, _id: -1 },
      {
        name: 'partial_replacement_candidate',
        partialFilterExpression: { appId: { $exists: true } }
      }
    );

    const run = createMongoIndexCleanupMigration({
      entries: [
        {
          collectionName,
          datasource: 'main',
          indexName: 'appId_1_updateTime_-1',
          key: { appId: 1, updateTime: -1 },
          options: {},
          requiredIndexes: [{ key: { appId: 1, updateTime: -1, _id: -1 }, options: {} }],
          reason: 'replacement required before drop'
        }
      ],
      pollIntervalMs: 15,
      prerequisiteWaitTimeoutMs: 45
    });

    const first = createContext();
    await expect(run(first.context)).rejects.toThrow('failed to clean up');
    expect(await listIndexNames(collectionName)).toContain('appId_1_updateTime_-1');
    expect(first.failures()).toEqual([
      {
        stageKey: 'cleanup',
        data: {
          collection: collectionName,
          indexName: 'appId_1_updateTime_-1',
          datasource: 'main'
        },
        reason: {
          message: 'Required replacement MongoDB index is not ready yet; keeping legacy index'
        }
      }
    ]);
    expect(first.context.reportProgress).not.toHaveBeenCalledWith({
      key: 'cleanup',
      status: 'succeeded',
      current: 1,
      total: 1
    });

    // 建好真正的全量替代索引后重试成功
    await db
      .collection(collectionName)
      .createIndex({ appId: 1, updateTime: -1, _id: -1 }, { name: 'appId_1_updateTime_-1__id_-1' });
    const retry = createContext();
    expect(await run(retry.context)).toEqual({
      totalCount: 1,
      droppedCount: 1,
      missingCount: 0,
      skippedCount: 0
    });
    expect(await listIndexNames(collectionName)).not.toContain('appId_1_updateTime_-1');
  });

  it('aborts promptly while waiting for replacement indexes and preserves legacy index', async () => {
    const collectionName = 'mig_idx_abort_wait_test';
    const db = connectionMongo.connection.db!;
    await db
      .collection(collectionName)
      .createIndex({ appId: 1, updateTime: -1 }, { name: 'appId_1_updateTime_-1' });

    const controller = new AbortController();
    const run = createMongoIndexCleanupMigration({
      entries: [
        {
          collectionName,
          datasource: 'main',
          indexName: 'appId_1_updateTime_-1',
          key: { appId: 1, updateTime: -1 },
          options: {},
          requiredIndexes: [{ key: { appId: 1, updateTime: -1, _id: -1 }, options: {} }],
          reason: 'abort while polling'
        }
      ],
      pollIntervalMs: 5_000,
      prerequisiteWaitTimeoutMs: 30_000
    });

    const { context } = createContext(controller.signal);
    const startedAt = Date.now();
    setTimeout(() => controller.abort(new Error('Runner stopping')), 30);

    await expect(run(context)).rejects.toThrow('Runner stopping');
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(await listIndexNames(collectionName)).toContain('appId_1_updateTime_-1');
  });

  it('defers cleanup without dropping when MONGO_DEPRECATE_INDEX=false and succeeds once enabled or manually dropped', async () => {
    process.env.MONGO_DEPRECATE_INDEX = 'false';
    const collectionName = 'mig_idx_disabled_test';
    const db = connectionMongo.connection.db!;
    await db.collection(collectionName).createIndex({ legacyField: 1 }, { name: 'legacyField_1' });
    await db
      .collection(collectionName)
      .createIndex({ replacementField: 1 }, { name: 'replacementField_1' });

    const run = createMongoIndexCleanupMigration({
      entries: [
        {
          collectionName,
          datasource: 'main',
          indexName: 'legacyField_1',
          key: { legacyField: 1 },
          options: {},
          requiredIndexes: [{ key: { replacementField: 1 }, options: {} }],
          reason: 'test disabled switch'
        }
      ]
    });

    // 1. 开关关闭且库里仍有旧索引：不删索引、不误标 succeeded，保留失败明细待后续重试
    const first = createContext();
    await expect(run(first.context)).rejects.toThrow('deferred while MONGO_DEPRECATE_INDEX');
    expect(await listIndexNames(collectionName)).toContain('legacyField_1');
    expect(first.failures()).toEqual([
      {
        stageKey: 'cleanup',
        data: {
          collection: collectionName,
          indexName: 'legacyField_1',
          datasource: 'main'
        },
        reason: {
          message:
            'Skipped because MONGO_DEPRECATE_INDEX is disabled; enable it or drop manually and retry'
        }
      }
    ]);

    // 2. 开启开关后重试：校验替代索引就绪并删除旧索引，成功收口
    process.env.MONGO_DEPRECATE_INDEX = 'true';
    const enabledRetry = createContext();
    expect(await run(enabledRetry.context)).toEqual({
      totalCount: 1,
      droppedCount: 1,
      missingCount: 0,
      skippedCount: 0
    });
    expect(await listIndexNames(collectionName)).not.toContain('legacyField_1');

    // 3. 库中已无旧索引时，即使开关关闭也能直接 succeeded（如全新部署或 DBA 已手工删完）
    process.env.MONGO_DEPRECATE_INDEX = 'false';
    const cleanRetry = createContext();
    expect(await run(cleanRetry.context)).toEqual({
      totalCount: 1,
      droppedCount: 0,
      missingCount: 1,
      skippedCount: 0
    });
  });

  it('fails validation with bounded structured records when a deprecated index remains and succeeds after retry', async () => {
    const collectionName = 'mig_idx_validation_fail_test';
    const db = connectionMongo.connection.db!;
    const entry: DeprecatedMongoIndexMigrationEntry = {
      collectionName,
      datasource: 'main',
      indexName: 'legacyField_1',
      key: { legacyField: 1 },
      options: {},
      reason: 'test validation invariant'
    };
    await db.collection(collectionName).createIndex({ legacyField: 1 }, { name: 'legacyField_1' });

    const run = createMongoIndexCleanupMigration({ entries: [entry] });
    const state = createContext();
    state.context.reportProgress.mockImplementation(async ({ key, status }) => {
      // 模拟清理后但校验前旧索引又被外部重新建出
      if (key === 'validation' && status === 'running') {
        await db
          .collection(collectionName)
          .createIndex({ legacyField: 1 }, { name: 'legacyField_1' });
      }
    });

    await expect(run(state.context)).rejects.toThrow('validation failed');
    expect(state.failures()).toEqual([
      {
        stageKey: 'validation',
        data: {
          collection: collectionName,
          indexName: 'legacyField_1',
          datasource: 'main'
        },
        reason: {
          message: 'Deprecated MongoDB index still exists after cleanup'
        }
      }
    ]);
    expect(state.context.reportProgress).not.toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
    });

    // 修复（不再重建）后重试成功
    state.context.reportProgress.mockReset();
    const retryResult = await run(state.context);
    expect(retryResult).toEqual({
      totalCount: 1,
      droppedCount: 1,
      missingCount: 0,
      skippedCount: 0
    });
    expect(await listIndexNames(collectionName)).not.toContain('legacyField_1');
  });

  it('stops immediately on lease loss before mutating remaining indexes', async () => {
    const collectionName = 'mig_idx_lease_loss_test';
    const db = connectionMongo.connection.db!;
    await db.collection(collectionName).createIndex({ a: 1 }, { name: 'a_1' });
    await db.collection(collectionName).createIndex({ b: 1 }, { name: 'b_1' });

    const run = createMongoIndexCleanupMigration({
      entries: [
        {
          collectionName,
          datasource: 'main',
          indexName: 'a_1',
          key: { a: 1 },
          options: {},
          reason: 'first'
        },
        {
          collectionName,
          datasource: 'main',
          indexName: 'b_1',
          key: { b: 1 },
          options: {},
          reason: 'second'
        }
      ]
    });

    const { context } = createContext();
    context.assertActive
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Lease lost'));

    await expect(run(context)).rejects.toThrow('Lease lost');
    expect(await listIndexNames(collectionName)).not.toContain('a_1');
    expect(await listIndexNames(collectionName)).toContain('b_1');
  });
});
