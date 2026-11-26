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
import { backfillLLMRequestRecordExpiredTime } from '@/migration/tasks/4180/20261126_backfill_llm_request_record_expired_time';
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

  it('backfills expiredTime from createdAt or ObjectId, removes createdAt, switches TTL indexes, and is idempotent', async () => {
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
      backfilledCount: 3,
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

    expect(docWithCreated?.createdAt).toBeUndefined();
    expect(docWithCreated?.expiredTime).toEqual(
      new Date(legacyCreatedAt.getTime() + 12 * 3600_000)
    );

    expect(docWithoutCreated?.createdAt).toBeUndefined();
    expect(docWithoutCreated?.expiredTime).toEqual(
      new Date(legacyWithoutCreatedAtId.getTimestamp().getTime() + 12 * 3600_000)
    );

    expect(docAlreadyMigrated?.createdAt).toBeUndefined();
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
      { key: 'cleanupLegacyIndex' },
      { key: 'validation' }
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

  it('preserves non-standard custom createdAt_1 index and handles empty collection', async () => {
    await MongoLLMRequestRecord.collection.createIndex(
      { createdAt: 1 },
      { name: LEGACY_LLM_RECORD_TTL_INDEX_NAME }
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
    expect(indexes.some((index) => index.name === LLMRequestRecordExpiredTimeIndexName)).toBe(true);
  });

  it('resumes from saved checkpoint without rescanning completed docs and stops on lease loss', async () => {
    const teamId = new Types.ObjectId();
    const id1 = new Types.ObjectId();
    const id2 = new Types.ObjectId();
    const migratedExpiredTime = new Date('2026-11-29T00:00:00.000Z');

    await MongoLLMRequestRecord.collection.insertMany([
      {
        _id: id1,
        teamId,
        requestId: 'already_done_before_checkpoint',
        body: {},
        response: {},
        expiredTime: migratedExpiredTime
      },
      {
        _id: id2,
        teamId,
        requestId: 'after_checkpoint',
        body: {},
        response: {},
        createdAt: new Date('2026-11-26T02:00:00.000Z')
      }
    ]);

    // 模拟租约在批次前丢失：不得执行后续扫描或修改数据。
    const lostLeaseRun = createContext();
    lostLeaseRun.context.assertActive.mockRejectedValueOnce(new Error('lease lost'));
    await expect(backfillLLMRequestRecordExpiredTime(lostLeaseRun.context)).rejects.toThrow(
      'lease lost'
    );
    expect(
      (await MongoLLMRequestRecord.collection.findOne({ _id: id2 }))?.expiredTime
    ).toBeUndefined();

    // 从 checkpoint (lastId = id1) 续跑：只处理 id2 并通过校验。
    const resumedRun = createContext({
      endId: String(id2),
      lastId: String(id1),
      scannedCount: 1,
      backfilledCount: 1
    });
    const resumedResult = await backfillLLMRequestRecordExpiredTime(resumedRun.context);
    expect(resumedResult).toEqual({
      scannedCount: 2,
      backfilledCount: 2,
      legacyIndexDropped: 0
    });
    expect((await MongoLLMRequestRecord.collection.findOne({ _id: id2 }))?.expiredTime).toEqual(
      new Date('2026-11-26T14:00:00.000Z')
    );
  });

  it('fails validation with structured records if a doc inside endId still lacks expiredTime', async () => {
    const teamId = new Types.ObjectId();
    const missingId = new Types.ObjectId();

    await MongoLLMRequestRecord.collection.insertOne({
      _id: missingId,
      teamId,
      requestId: 'skipped_by_checkpoint',
      body: {},
      response: {},
      createdAt: new Date('2026-11-26T00:00:00.000Z')
    });

    // 模拟 checkpoint 已越过该文档但该文档仍缺少 expiredTime：校验阶段必须报错阻断伪成功。
    const run = createContext({
      endId: String(missingId),
      lastId: String(missingId),
      scannedCount: 1,
      backfilledCount: 0
    });

    await expect(backfillLLMRequestRecordExpiredTime(run.context)).rejects.toThrow(
      'LLM request record expiredTime migration validation failed'
    );
    expect(run.getFailures()).toEqual([
      {
        stageKey: 'validation',
        data: { id: String(missingId) },
        reason: {
          message: 'LLM request record is missing a valid Date expiredTime after backfill'
        }
      }
    ]);
  });
});
