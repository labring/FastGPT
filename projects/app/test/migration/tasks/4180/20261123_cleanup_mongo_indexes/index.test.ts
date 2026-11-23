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

  it('drops exact-matching legacy indexes (main + log + partial unique + TTL), preserves customer indexes, and replays idempotently', async () => {
    const mainDb = connectionMongo.connection.db!;
    const logDb = connectionLogMongo.connection.db!;

    // 1. 构造真实历史废弃索引：普通、partial unique、TTL 与 log 库索引
    await mainDb
      .collection('chats')
      .createIndex({ appId: 1, updateTime: -1 }, { name: 'appId_1_updateTime_-1' });
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
    await mainDb
      .collection('model_status_probe_records')
      .createIndex({ testedAt: 1 }, { name: 'testedAt_1', expireAfterSeconds: 30 * 24 * 60 * 60 });
    await logDb
      .collection('app_chat_logs')
      .createIndex({ teamId: 1, appId: 1, userId: 1 }, { name: 'teamId_1_appId_1_userId_1' });

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

    // 验证四条精确匹配的废弃索引已删除
    expect(await listIndexNames('chats')).not.toContain('appId_1_updateTime_-1');
    expect(await listIndexNames('systemConfigs')).not.toContain('runtime_scope_type_unique');
    expect(await listIndexNames('model_status_probe_records')).not.toContain('testedAt_1');
    expect(await listIndexNames('app_chat_logs', 'log')).not.toContain('teamId_1_appId_1_userId_1');

    // 验证客户同名定制索引与客户自建索引完好保留
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

  it('skips dropping indexes without error when MONGO_DEPRECATE_INDEX=false', async () => {
    process.env.MONGO_DEPRECATE_INDEX = 'false';
    const collectionName = 'mig_idx_disabled_test';
    const db = connectionMongo.connection.db!;
    await db.collection(collectionName).createIndex({ legacyField: 1 }, { name: 'legacyField_1' });

    const run = createMongoIndexCleanupMigration({
      entries: [
        {
          collectionName,
          datasource: 'main',
          indexName: 'legacyField_1',
          key: { legacyField: 1 },
          options: {},
          reason: 'test disabled switch'
        }
      ]
    });

    const { context } = createContext();
    const result = await run(context);
    expect(result).toEqual({
      totalCount: 1,
      droppedCount: 0,
      missingCount: 0,
      skippedCount: 1
    });
    expect(await listIndexNames(collectionName)).toContain('legacyField_1');
    expect(context.reportProgress).toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
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
