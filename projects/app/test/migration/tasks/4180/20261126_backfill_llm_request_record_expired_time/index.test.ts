import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import {
  LLMRequestRecordExpiredTimeIndexName,
  MongoLLMRequestRecord
} from '@fastgpt/service/core/ai/record/schema';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  backfillLLMRequestRecordExpiredTime,
  createBackfillLLMRequestRecordExpiredTimeMigration
} from '@/migration/tasks/4180/20261126_backfill_llm_request_record_expired_time';
import { LEGACY_LLM_RECORD_TTL_INDEX_NAME } from '@/migration/tasks/4180/20261126_backfill_llm_request_record_expired_time/service';

const originalSnapshot = global.systemInstanceConfig;

const setRetentionHours = (hours: number) => {
  const snapshot = resolveSystemInstanceConfig({});
  snapshot.performance.tracking.retentionHours = hours;
  global.systemInstanceConfig = snapshot;
};

const createContext = (initialCheckpoint?: unknown) => {
  let checkpoint = initialCheckpoint;
  let failures: SystemMigrationFailedRecord[] = [];
  const progress: Array<{ key: string; status: SystemMigrationStatusEnum; current?: number }> = [];

  const context = {
    migrationId: '20261126_backfill_llm_request_record_expired_time',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: vi.fn(async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint)
    ),
    saveCheckpoint: vi.fn(async (value: unknown) => {
      checkpoint = structuredClone(value);
    }),
    getFailedRecords: vi.fn(async () => structuredClone(failures)),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async (step) => {
      progress.push({ key: step.key, status: step.status, current: step.current });
    }),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;

  return {
    context,
    getCheckpoint: () => checkpoint,
    getFailures: () => failures,
    progress
  };
};

const resetCollection = async () => {
  await MongoLLMRequestRecord.collection.drop().catch((error: { code?: number }) => {
    if (error.code !== 26) throw error;
  });
};

describe('20261126_backfill_llm_request_record_expired_time', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    setRetentionHours(12);
    await resetCollection();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.systemInstanceConfig = originalSnapshot;
  });

  it('backfills expiredTime while preserving createdAt for rollback, validates before dropping legacy index, and is idempotent', async () => {
    const teamId = new Types.ObjectId();
    const legacyCreatedAt = new Date('2026-11-26T00:00:00.000Z');
    const existingExpiredTime = new Date('2026-11-28T12:00:00.000Z');
    const legacyWithCreatedAtId = new Types.ObjectId();
    const legacyWithoutCreatedAtId = new Types.ObjectId();
    const alreadyMigratedId = new Types.ObjectId();

    await MongoLLMRequestRecord.collection.createIndex(
      { createdAt: 1 },
      { name: LEGACY_LLM_RECORD_TTL_INDEX_NAME, expireAfterSeconds: 24 * 3600 }
    );
    await MongoLLMRequestRecord.collection.insertMany([
      {
        _id: legacyWithCreatedAtId,
        teamId,
        requestId: 'legacy_with_created',
        body: {},
        response: {},
        createdAt: legacyCreatedAt
      },
      {
        _id: legacyWithoutCreatedAtId,
        teamId,
        requestId: 'legacy_without_created',
        body: {},
        response: {}
      },
      {
        _id: alreadyMigratedId,
        teamId,
        requestId: 'already_migrated',
        body: {},
        response: {},
        createdAt: legacyCreatedAt,
        expiredTime: existingExpiredTime
      }
    ]);

    const firstRun = createContext();
    const firstResult = await backfillLLMRequestRecordExpiredTime(firstRun.context);

    expect(firstResult).toEqual({
      scannedCount: 3,
      backfilledCount: 2,
      legacyIndexDropped: 1
    });

    const docWithCreated = await MongoLLMRequestRecord.collection.findOne({
      _id: legacyWithCreatedAtId
    });
    const docWithoutCreated = await MongoLLMRequestRecord.collection.findOne({
      _id: legacyWithoutCreatedAtId
    });
    const docAlreadyMigrated = await MongoLLMRequestRecord.collection.findOne({
      _id: alreadyMigratedId
    });

    // 保留 createdAt 供 v4.17.x 回滚安全读取。
    expect(docWithCreated?.createdAt).toEqual(legacyCreatedAt);
    expect(docWithCreated?.expiredTime).toEqual(
      new Date(legacyCreatedAt.getTime() + 12 * 3600_000)
    );

    expect(docWithoutCreated?.createdAt).toBeUndefined();
    expect(docWithoutCreated?.expiredTime).toEqual(
      new Date(legacyWithoutCreatedAtId.getTimestamp().getTime() + 12 * 3600_000)
    );

    expect(docAlreadyMigrated?.createdAt).toEqual(legacyCreatedAt);
    expect(docAlreadyMigrated?.expiredTime).toEqual(existingExpiredTime);

    const indexes = await MongoLLMRequestRecord.collection.indexes();
    expect(indexes.some((index) => index.name === LEGACY_LLM_RECORD_TTL_INDEX_NAME)).toBe(false);
    expect(
      indexes.find((index) => index.name === LLMRequestRecordExpiredTimeIndexName)
    ).toMatchObject({
      key: { expiredTime: 1 },
      expireAfterSeconds: 0
    });

    expect(
      firstRun.progress.filter((step) => step.status === SystemMigrationStatusEnum.succeeded)
    ).toMatchObject([
      { key: 'backfill', current: 3 },
      { key: 'validation' },
      { key: 'cleanupLegacyIndex' }
    ]);

    // 重复执行保持幂等：不覆写已有 expiredTime，也不报错。
    const secondRun = createContext();
    const secondResult = await backfillLLMRequestRecordExpiredTime(secondRun.context);
    expect(secondResult).toEqual({
      scannedCount: 3,
      backfilledCount: 0,
      legacyIndexDropped: 0
    });
    expect(
      (await MongoLLMRequestRecord.collection.findOne({ _id: legacyWithCreatedAtId }))?.expiredTime
    ).toEqual(new Date(legacyCreatedAt.getTime() + 12 * 3600_000));
  });

  it('defers dropping legacy createdAt_1 index when MONGO_DEPRECATE_INDEX is disabled', async () => {
    await MongoLLMRequestRecord.collection.createIndex(
      { createdAt: 1 },
      { name: LEGACY_LLM_RECORD_TTL_INDEX_NAME, expireAfterSeconds: 6 * 3600 }
    );

    const migration = createBackfillLLMRequestRecordExpiredTimeMigration({
      isCleanupEnabled: () => false
    });
    const run = createContext();

    await expect(migration(run.context)).rejects.toThrow('MONGO_DEPRECATE_INDEX is disabled');
    expect(run.getFailures()).toMatchObject([
      {
        stageKey: 'cleanupLegacyIndex',
        data: { indexName: LEGACY_LLM_RECORD_TTL_INDEX_NAME }
      }
    ]);

    const indexes = await MongoLLMRequestRecord.collection.indexes();
    expect(indexes.some((index) => index.name === LEGACY_LLM_RECORD_TTL_INDEX_NAME)).toBe(true);
    expect(indexes.some((index) => index.name === LLMRequestRecordExpiredTimeIndexName)).toBe(true);
  });

  it.each([
    { label: 'non-TTL index', options: {} },
    { label: 'non-hourly custom TTL', options: { expireAfterSeconds: 90 } },
    { label: 'hidden TTL index', options: { expireAfterSeconds: 6 * 3600, hidden: true } }
  ])(
    'preserves non-standard custom createdAt_1 ($label) and handles empty collection',
    async ({ options }) => {
      await MongoLLMRequestRecord.collection.createIndex(
        { createdAt: 1 },
        { name: LEGACY_LLM_RECORD_TTL_INDEX_NAME, ...options }
      );

      const run = createContext();
      const result = await backfillLLMRequestRecordExpiredTime(run.context);

      expect(result).toEqual({
        scannedCount: 0,
        backfilledCount: 0,
        legacyIndexDropped: 0
      });
      expect(run.context.logger.warn).toHaveBeenCalled();

      const indexes = await MongoLLMRequestRecord.collection.indexes();
      expect(indexes.some((index) => index.name === LEGACY_LLM_RECORD_TTL_INDEX_NAME)).toBe(true);
      expect(indexes.some((index) => index.name === LLMRequestRecordExpiredTimeIndexName)).toBe(
        true
      );
    }
  );

  it('blocks legacy index drop if a late unmigrated doc arrives after endId and succeeds cleanly on retry', async () => {
    const teamId = new Types.ObjectId();
    const initialId = new Types.ObjectId();
    const lateOldPodId = new Types.ObjectId();

    await MongoLLMRequestRecord.collection.createIndex(
      { createdAt: 1 },
      { name: LEGACY_LLM_RECORD_TTL_INDEX_NAME, expireAfterSeconds: 6 * 3600 }
    );
    await MongoLLMRequestRecord.collection.insertMany([
      {
        _id: initialId,
        teamId,
        requestId: 'before_end_id',
        body: {},
        response: {},
        createdAt: new Date('2026-11-26T00:00:00.000Z')
      },
      {
        _id: lateOldPodId,
        teamId,
        requestId: 'late_old_pod_write',
        body: {},
        response: {},
        createdAt: new Date('2026-11-26T01:00:00.000Z')
      }
    ]);

    // 模拟首次执行已扫描至 initialId 后，旧节点又写入了 lateOldPodId（缺少 expiredTime）：
    // 校验阶段必须发现全表遗漏并在删除旧索引前失败，保留 createdAt_1 兜底 TTL。
    const blockedRun = createContext({
      endId: String(initialId),
      lastId: String(initialId),
      scannedCount: 1,
      backfilledCount: 1
    });
    // 为 initialId 预先补好 expiredTime，仅让 lateOldPodId 处于未回填状态，
    // 并把 findLatestLLMRequestRecordId 的场景用 checkpoint.lastId = initialId 且 endId = initialId 后的混跑失败验证：
    await MongoLLMRequestRecord.collection.updateOne(
      { _id: initialId },
      { $set: { expiredTime: new Date('2026-11-26T12:00:00.000Z') } }
    );

    // 模拟重试：checkpoint 会推进 endId 至 lateOldPodId，从 initialId 之后增量回填并清理旧索引。
    const resumedResult = await backfillLLMRequestRecordExpiredTime(blockedRun.context);
    expect(resumedResult).toEqual({
      scannedCount: 2,
      backfilledCount: 2,
      legacyIndexDropped: 1
    });
    expect(
      (await MongoLLMRequestRecord.collection.findOne({ _id: lateOldPodId }))?.expiredTime
    ).toEqual(new Date('2026-11-26T13:00:00.000Z'));

    // 单独验证校验阶段在存在未回填文档时不会删掉旧索引（通过模拟 backfill 跳过某条记录）：
    await resetCollection();
    const skippedId = new Types.ObjectId();
    await MongoLLMRequestRecord.collection.createIndex(
      { createdAt: 1 },
      { name: LEGACY_LLM_RECORD_TTL_INDEX_NAME, expireAfterSeconds: 6 * 3600 }
    );
    await MongoLLMRequestRecord.collection.insertOne({
      _id: skippedId,
      teamId,
      requestId: 'skipped_by_checkpoint',
      body: {},
      response: {},
      createdAt: new Date('2026-11-26T00:00:00.000Z')
    });

    const failRun = createContext({
      endId: String(skippedId),
      lastId: String(skippedId),
      scannedCount: 1,
      backfilledCount: 0
    });
    await expect(backfillLLMRequestRecordExpiredTime(failRun.context)).rejects.toThrow(
      'validation failed before legacy index cleanup'
    );
    expect(failRun.getFailures()).toMatchObject([
      { stageKey: 'validation', data: { id: String(skippedId) } }
    ]);
    // 校验失败时绝不能删除旧 createdAt_1 索引。
    const remainingIndexes = await MongoLLMRequestRecord.collection.indexes();
    expect(remainingIndexes.some((index) => index.name === LEGACY_LLM_RECORD_TTL_INDEX_NAME)).toBe(
      true
    );
  });

  it('stops immediately on lease loss without modifying remaining documents', async () => {
    const teamId = new Types.ObjectId();
    const id = new Types.ObjectId();
    await MongoLLMRequestRecord.collection.insertOne({
      _id: id,
      teamId,
      requestId: 'before_lease_loss',
      body: {},
      response: {},
      createdAt: new Date('2026-11-26T02:00:00.000Z')
    });

    const lostLeaseRun = createContext();
    lostLeaseRun.context.assertActive.mockRejectedValueOnce(new Error('lease lost'));
    await expect(backfillLLMRequestRecordExpiredTime(lostLeaseRun.context)).rejects.toThrow(
      'lease lost'
    );
    expect(
      (await MongoLLMRequestRecord.collection.findOne({ _id: id }))?.expiredTime
    ).toBeUndefined();
  });
});
