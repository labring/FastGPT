import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { backfillFolderAncestorIds } from '@/migration/tasks/4173/20261022_backfill_folder_ancestor_ids';
import {
  getFolderMigrationSnapshot,
  migrateFolderMigrationBatch,
  readFolderMigrationBatch,
  readFolderMigrationDocsByIds
} from '@/migration/tasks/4173/20261022_backfill_folder_ancestor_ids/service';

vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 50 }));
vi.mock('@/migration/tasks/4173/20261022_backfill_folder_ancestor_ids/service', () => ({
  getFolderMigrationSnapshot: vi.fn(),
  migrateFolderMigrationBatch: vi.fn(),
  readFolderMigrationBatch: vi.fn(),
  readFolderMigrationDocsByIds: vi.fn()
}));

const appId = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const datasetId = new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');

const createContext = (initialCheckpoint?: Record<string, unknown>) => {
  let checkpoint = initialCheckpoint;
  const context = {
    migrationId: '20261022_backfill_folder_ancestor_ids',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    getFailedRecords: vi.fn(async () => []),
    reportFailedRecords: vi.fn(async () => undefined),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    reportProgress: vi.fn(async () => undefined),
    assertActive: vi.fn(async () => undefined),
    fail: vi.fn(async () => {
      throw new Error('migration failed');
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, getCheckpoint: () => checkpoint };
};

describe('backfillFolderAncestorIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFolderMigrationSnapshot).mockImplementation(async (stage) => ({
      endId: stage === 'apps' ? appId : datasetId,
      total: 1
    }));
    vi.mocked(readFolderMigrationBatch).mockImplementation(async ({ stage, lastId }) =>
      lastId ? [] : [{ _id: stage === 'apps' ? appId : datasetId } as never]
    );
    vi.mocked(migrateFolderMigrationBatch).mockResolvedValue({ errors: [], changedCount: 0 });
    vi.mocked(readFolderMigrationDocsByIds).mockResolvedValue([]);
  });

  it('scans both collections, validates all rows, and completes every progress stage', async () => {
    const { context } = createContext();
    await expect(backfillFolderAncestorIds(context)).resolves.toEqual({
      scannedCount: 2,
      failedCount: 0
    });

    expect(vi.mocked(migrateFolderMigrationBatch)).toHaveBeenCalledWith({
      stage: 'apps',
      docs: expect.any(Array)
    });
    expect(vi.mocked(migrateFolderMigrationBatch)).toHaveBeenCalledWith({
      stage: 'datasets',
      docs: expect.any(Array)
    });
    expect(context.reportProgress).toHaveBeenCalledWith({
      key: 'validation',
      status: SystemMigrationStatusEnum.succeeded,
      current: 2,
      total: 2
    });
    expect(context.saveCheckpoint).toHaveBeenCalled();
  });

  it('persists skipped bad rows before advancing and fails with the complete unresolved snapshot', async () => {
    const { context } = createContext();
    vi.mocked(getFolderMigrationSnapshot).mockImplementation(async (stage) => ({
      endId: stage === 'apps' ? appId : null,
      total: stage === 'apps' ? 1 : 0
    }));
    vi.mocked(readFolderMigrationBatch).mockImplementation(async ({ stage, lastId }) =>
      stage === 'apps' && !lastId ? [{ _id: appId } as never] : []
    );
    vi.mocked(migrateFolderMigrationBatch).mockImplementation(async ({ stage }) => ({
      errors:
        stage === 'apps' ? [{ id: String(appId), reason: 'parent document does not exist' }] : [],
      changedCount: 0
    }));

    await expect(backfillFolderAncestorIds(context)).rejects.toThrow('migration failed');
    const failedRecord = {
      stageKey: 'apps',
      data: { collection: 'apps', documentId: String(appId) },
      reason: { message: 'parent document does not exist' }
    };
    expect(context.reportFailedRecords).toHaveBeenCalledWith([failedRecord]);
    expect(context.fail).toHaveBeenCalledWith({
      message: expect.stringContaining('1 folder records'),
      failedRecords: [failedRecord]
    });
    expect(context.reportFailedRecords.mock.invocationCallOrder[0]).toBeLessThan(
      context.saveCheckpoint.mock.invocationCallOrder[1]
    );
  });

  it('retries saved bad rows before resuming the checkpoint and replaces the error snapshot', async () => {
    const failedRecord = {
      stageKey: 'apps',
      data: { collection: 'apps', documentId: String(appId) },
      reason: { message: 'parent document does not exist' }
    };
    const { context } = createContext({
      version: 1,
      stage: 'datasets',
      endId: String(datasetId),
      lastId: null,
      current: 0,
      total: 1
    });
    context.getFailedRecords.mockResolvedValue([failedRecord]);
    vi.mocked(readFolderMigrationDocsByIds).mockResolvedValue([{ _id: appId } as never]);

    await backfillFolderAncestorIds(context);

    expect(readFolderMigrationDocsByIds).toHaveBeenCalledWith({
      stage: 'apps',
      ids: [String(appId)]
    });
    expect(context.reportFailedRecords).toHaveBeenCalledWith([]);
    expect(context.saveCheckpoint).toHaveBeenCalled();
  });
});
