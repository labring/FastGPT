import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { BillPayWayEnum, BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { backfillBillMetadata } from '@/migration/tasks/4170/20260905_backfill_bill_metadata';
import type { SystemMigrationContext } from '@/migration/registry';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBillCollection = () => connectionMongo.connection.db!.collection('pays');

const createContext = () => {
  const progress: unknown[] = [];
  const context = {
    migrationId: '20260905_backfill_bill_metadata',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async () => undefined,
    getFailedRecords: async () => [],
    reportFailedRecords: vi.fn(async () => undefined),
    saveCheckpoint: vi.fn(async () => undefined),
    reportProgress: vi.fn(async (value) => {
      progress.push(value);
    }),
    assertActive: vi.fn(async () => undefined),
    fail: vi.fn(async (error) => {
      throw new Error(error.message);
    }),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  } satisfies SystemMigrationContext;

  return { context, progress };
};

describe('4170 bill metadata migration', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await getBillCollection().deleteMany({});
  });

  it('backfills legacy balance bills without overwriting current orders', async () => {
    const missingId = new Types.ObjectId();
    const emptyId = new Types.ObjectId();
    const partialId = new Types.ObjectId();
    const nullId = new Types.ObjectId();
    const currentId = new Types.ObjectId();
    const otherTypeId = new Types.ObjectId();
    await getBillCollection().insertMany([
      { _id: missingId, type: BillTypeEnum.balance },
      { _id: emptyId, type: BillTypeEnum.balance, metadata: {} },
      { _id: partialId, type: BillTypeEnum.balance, metadata: { month: 1 } },
      { _id: nullId, type: BillTypeEnum.balance, metadata: null },
      {
        _id: currentId,
        type: BillTypeEnum.balance,
        metadata: { payWay: BillPayWayEnum.alipay }
      },
      { _id: otherTypeId, type: BillTypeEnum.standSubPlan }
    ]);
    const { context, progress } = createContext();

    await expect(backfillBillMetadata(context)).resolves.toEqual({ migratedCount: 4 });

    for (const _id of [missingId, emptyId, nullId]) {
      await expect(getBillCollection().findOne({ _id })).resolves.toMatchObject({
        metadata: { payWay: BillPayWayEnum.wx }
      });
    }
    await expect(getBillCollection().findOne({ _id: partialId })).resolves.toMatchObject({
      metadata: { payWay: BillPayWayEnum.wx, month: 1 }
    });
    await expect(getBillCollection().findOne({ _id: currentId })).resolves.toMatchObject({
      metadata: { payWay: BillPayWayEnum.alipay }
    });
    await expect(getBillCollection().findOne({ _id: otherTypeId })).resolves.not.toHaveProperty(
      'metadata'
    );
    expect(progress).toEqual([
      {
        key: 'bills',
        status: SystemMigrationStatusEnum.running,
        current: 0,
        total: 4
      },
      {
        key: 'bills',
        status: SystemMigrationStatusEnum.succeeded,
        current: 4,
        total: 4
      }
    ]);
  });

  it('is idempotent when the full task is replayed', async () => {
    const billId = new Types.ObjectId();
    await getBillCollection().insertOne({ _id: billId, type: BillTypeEnum.balance });

    await expect(backfillBillMetadata(createContext().context)).resolves.toEqual({
      migratedCount: 1
    });
    await expect(backfillBillMetadata(createContext().context)).resolves.toEqual({
      migratedCount: 0
    });
    await expect(getBillCollection().findOne({ _id: billId })).resolves.toMatchObject({
      metadata: { payWay: BillPayWayEnum.wx }
    });
  });

  it('does not write after losing the migration lease', async () => {
    const billId = new Types.ObjectId();
    await getBillCollection().insertOne({ _id: billId, type: BillTypeEnum.balance });
    const { context } = createContext();
    context.assertActive.mockRejectedValue(new Error('lease lost'));

    await expect(backfillBillMetadata(context)).rejects.toThrow('lease lost');
    await expect(getBillCollection().findOne({ _id: billId })).resolves.not.toHaveProperty(
      'metadata'
    );
  });

  it('fails completion when matching records remain', async () => {
    const lateBillId = new Types.ObjectId();
    const { context } = createContext();
    context.assertActive.mockResolvedValueOnce(undefined).mockImplementationOnce(async () => {
      await getBillCollection().insertOne({
        _id: lateBillId,
        type: BillTypeEnum.balance
      });
    });

    await expect(backfillBillMetadata(context)).rejects.toThrow(
      '1 historical balance bills still lack payment metadata'
    );
    expect(context.logger.error).toHaveBeenCalledWith(
      'Historical balance bills still lack payment metadata',
      { remainingCount: 1 }
    );
  });
});
