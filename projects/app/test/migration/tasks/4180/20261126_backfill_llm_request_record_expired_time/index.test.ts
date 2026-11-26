import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { LEGACY_LLM_RECORD_TTL_INDEX_NAME } from '@fastgpt/service/core/ai/record/mongo/ttl';
import {
  LLMRequestRecordExpiredTimeIndexName,
  MongoLLMRequestRecord
} from '@fastgpt/service/core/ai/record/schema';
import type { SystemMigrationContext } from '@/migration/registry';
import { backfillLLMRequestRecordExpiredTime } from '@/migration/tasks/4180/20261126_backfill_llm_request_record_expired_time';

const originalSnapshot = global.systemInstanceConfig;

const setRetentionHours = (hours: number) => {
  const snapshot = resolveSystemInstanceConfig({});
  snapshot.performance.tracking.retentionHours = hours;
  global.systemInstanceConfig = snapshot;
};

const createContext = (
  initialCheckpoint?: unknown,
  initialFailures: SystemMigrationFailedRecord[] = []
) => {
  let checkpoint = initialCheckpoint;
  let failures: SystemMigrationFailedRecord[] = structuredClone(initialFailures);
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

  it('backfills expiredTime using live legacy createdAt_1 TTL while preserving createdAt and legacy index for N+1 retirement', async () => {
    const teamId = new Types.ObjectId();
    const legacyCreatedAt = new Date('2026-11-26T00:00:00.000Z');
    const existingExpiredTime = new Date('2026-11-28T12:00:00.000Z');
    const legacyWithCreatedAtId = new Types.ObjectId();
    const legacyWithoutCreatedAtId = new Types.ObjectId();
    const alreadyMigratedId = new Types.ObjectId();

    // 旧索引为 48 小时，管理员已提前将运行配置调小至 12 小时；
    // 存量回填必须沿用旧索引 48 小时有效期限，不缩短旧记录原有保留时长。
    await MongoLLMRequestRecord.collection.createIndex(
      { createdAt: 1 },
      { name: LEGACY_LLM_RECORD_TTL_INDEX_NAME, expireAfterSeconds: 48 * 3600 }
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
      backfilledCount: 2
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

    // 保留 createdAt 供 v4.17.x 回滚安全读取，并按原 48h 期限回填。
    expect(docWithCreated?.createdAt).toEqual(legacyCreatedAt);
    expect(docWithCreated?.expiredTime).toEqual(
      new Date(legacyCreatedAt.getTime() + 48 * 3600_000)
    );

    expect(docWithoutCreated?.createdAt).toBeUndefined();
    expect(docWithoutCreated?.expiredTime).toEqual(
      new Date(legacyWithoutCreatedAtId.getTimestamp().getTime() + 48 * 3600_000)
    );

    expect(docAlreadyMigrated?.createdAt).toEqual(legacyCreatedAt);
    expect(docAlreadyMigrated?.expiredTime).toEqual(existingExpiredTime);

    // 两版本 Expand-Contract：v4.18.0 只扩展新索引与回填，保留旧 createdAt_1 留待 N+1 退役。
    const indexes = await MongoLLMRequestRecord.collection.indexes();
    expect(indexes.some((index) => index.name === LEGACY_LLM_RECORD_TTL_INDEX_NAME)).toBe(true);
    expect(
      indexes.find((index) => index.name === LLMRequestRecordExpiredTimeIndexName)
    ).toMatchObject({
      key: { expiredTime: 1 },
      expireAfterSeconds: 0
    });

    expect(
      firstRun.progress.filter((step) => step.status === SystemMigrationStatusEnum.succeeded)
    ).toMatchObject([{ key: 'backfill', current: 3 }, { key: 'validation' }]);

    // 重复执行保持幂等：不覆写已有 expiredTime，也不报错。
    const secondRun = createContext();
    const secondResult = await backfillLLMRequestRecordExpiredTime(secondRun.context);
    expect(secondResult).toEqual({
      scannedCount: 3,
      backfilledCount: 0
    });
    expect(
      (await MongoLLMRequestRecord.collection.findOne({ _id: legacyWithCreatedAtId }))?.expiredTime
    ).toEqual(new Date(legacyCreatedAt.getTime() + 48 * 3600_000));
  });

  it('falls back to configured retentionHours when no legacy createdAt TTL index exists and respects 0-second legacy TTL', async () => {
    const teamId = new Types.ObjectId();
    const createdAt = new Date('2026-11-26T00:00:00.000Z');
    const docId = new Types.ObjectId();

    await MongoLLMRequestRecord.collection.insertOne({
      _id: docId,
      teamId,
      requestId: 'no_legacy_index',
      body: {},
      response: {},
      createdAt
    });

    const fallbackRun = createContext();
    const fallbackResult = await backfillLLMRequestRecordExpiredTime(fallbackRun.context);
    expect(fallbackResult).toEqual({ scannedCount: 1, backfilledCount: 1 });
    expect((await MongoLLMRequestRecord.collection.findOne({ _id: docId }))?.expiredTime).toEqual(
      new Date(createdAt.getTime() + 12 * 3600_000)
    );

    // 兼容历史 0 秒 TTL：存量记录应沿用 0 秒过期（即 createdAt 本身）。
    await resetCollection();
    const zeroTtlDocId = new Types.ObjectId();
    await MongoLLMRequestRecord.collection.createIndex(
      { createdAt: 1 },
      { name: LEGACY_LLM_RECORD_TTL_INDEX_NAME, expireAfterSeconds: 0 }
    );
    await MongoLLMRequestRecord.collection.insertOne({
      _id: zeroTtlDocId,
      teamId,
      requestId: 'zero_legacy_ttl',
      body: {},
      response: {},
      createdAt
    });

    const zeroTtlRun = createContext();
    const zeroTtlResult = await backfillLLMRequestRecordExpiredTime(zeroTtlRun.context);
    expect(zeroTtlResult).toEqual({ scannedCount: 1, backfilledCount: 1 });
    expect(
      (await MongoLLMRequestRecord.collection.findOne({ _id: zeroTtlDocId }))?.expiredTime
    ).toEqual(createdAt);
  });

  it('recovers a pre-cursor missing record (_id < lastId) on retry by consuming failedRecords', async () => {
    const teamId = new Types.ObjectId();
    // 构造同一秒内跨进程乱序的两个 ObjectId：preCursorId < cursorId。
    const preCursorId = new Types.ObjectId('692600000000000000000001');
    const cursorId = new Types.ObjectId('69260000ffffffffffffffff');
    const createdAt = new Date('2026-11-26T00:00:00.000Z');

    await MongoLLMRequestRecord.collection.createIndex(
      { createdAt: 1 },
      { name: LEGACY_LLM_RECORD_TTL_INDEX_NAME, expireAfterSeconds: 6 * 3600 }
    );
    await MongoLLMRequestRecord.collection.insertMany([
      {
        _id: cursorId,
        teamId,
        requestId: 'already_scanned_cursor',
        body: {},
        response: {},
        createdAt,
        expiredTime: new Date(createdAt.getTime() + 6 * 3600_000)
      },
      {
        _id: preCursorId,
        teamId,
        requestId: 'late_same_second_old_pod',
        body: {},
        response: {},
        createdAt
      }
    ]);

    // 首次执行时游标已停在 cursorId（endId=lastId=cursorId），全表校验捕获 preCursorId 并落盘失败明细。
    const run = createContext({
      endId: String(cursorId),
      lastId: String(cursorId),
      scannedCount: 1,
      backfilledCount: 1,
      backfillTtlSeconds: 6 * 3600
    });
    await expect(backfillLLMRequestRecordExpiredTime(run.context)).rejects.toThrow(
      'validation failed'
    );
    expect(run.getFailures()).toMatchObject([
      { stageKey: 'validation', data: { id: String(preCursorId) } }
    ]);

    // 停止旧节点后原 checkpoint + failedRecords 重试：先按失败明细 ID 补齐游标前的漏写记录并清空失败快照。
    const retryRun = createContext(run.getCheckpoint(), run.getFailures());
    const retryResult = await backfillLLMRequestRecordExpiredTime(retryRun.context);

    expect(retryResult).toEqual({
      scannedCount: 1,
      backfilledCount: 2
    });
    expect(retryRun.getFailures()).toEqual([]);
    expect(
      (await MongoLLMRequestRecord.collection.findOne({ _id: preCursorId }))?.expiredTime
    ).toEqual(new Date(createdAt.getTime() + 6 * 3600_000));
  });

  it('advances endId on retry when a late unmigrated doc arrives after endId', async () => {
    const teamId = new Types.ObjectId();
    const initialId = new Types.ObjectId();
    const lateOldPodId = new Types.ObjectId();
    const createdAt = new Date('2026-11-26T01:00:00.000Z');

    await MongoLLMRequestRecord.collection.createIndex(
      { createdAt: 1 },
      { name: LEGACY_LLM_RECORD_TTL_INDEX_NAME, expireAfterSeconds: 24 * 3600 }
    );
    await MongoLLMRequestRecord.collection.insertMany([
      {
        _id: initialId,
        teamId,
        requestId: 'before_end_id',
        body: {},
        response: {},
        createdAt: new Date('2026-11-26T00:00:00.000Z'),
        expiredTime: new Date('2026-11-27T00:00:00.000Z')
      },
      {
        _id: lateOldPodId,
        teamId,
        requestId: 'late_old_pod_write',
        body: {},
        response: {},
        createdAt
      }
    ]);

    const resumedRun = createContext({
      endId: String(initialId),
      lastId: String(initialId),
      scannedCount: 1,
      backfilledCount: 1,
      backfillTtlSeconds: 24 * 3600
    });
    const resumedResult = await backfillLLMRequestRecordExpiredTime(resumedRun.context);

    expect(resumedResult).toEqual({
      scannedCount: 2,
      backfilledCount: 2
    });
    expect(
      (await MongoLLMRequestRecord.collection.findOne({ _id: lateOldPodId }))?.expiredTime
    ).toEqual(new Date(createdAt.getTime() + 24 * 3600_000));
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
