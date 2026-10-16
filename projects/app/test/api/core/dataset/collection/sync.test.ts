import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const mocks = vi.hoisted(() => ({
  parseApiInput: vi.fn(),
  authDatasetCollection: vi.fn(),
  syncCollection: vi.fn(),
  upsertAuditLogByTaskId: vi.fn(),
  updateAuditLogByTaskId: vi.fn(),
  getI18nDatasetType: vi.fn(),
  refreshTrainingAuditTask: vi.fn(),
  randomUUID: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/common/zod/requestParseError', () => ({
  parseApiInput: mocks.parseApiInput
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollection: mocks.authDatasetCollection
}));

vi.mock('@fastgpt/service/core/dataset/collection/utils', () => ({
  syncCollection: mocks.syncCollection
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  upsertAuditLogByTaskId: mocks.upsertAuditLogByTaskId,
  updateAuditLogByTaskId: mocks.updateAuditLogByTaskId,
  getI18nDatasetType: mocks.getI18nDatasetType
}));

vi.mock('@fastgpt/service/core/dataset/training/audit', () => ({
  refreshTrainingAuditTask: mocks.refreshTrainingAuditTask
}));

vi.mock('node:crypto', () => ({
  randomUUID: mocks.randomUUID
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  LogCategories: {
    MODULE: {
      DATASET: {
        COLLECTION: 'dataset.collection'
      }
    }
  },
  getLogger: () => ({
    error: vi.fn()
  })
}));

import handler from '@/pages/api/core/dataset/collection/sync';

const collectionId = 'collection-id';
const collection = {
  _id: collectionId,
  datasetId: 'dataset-id',
  teamId: 'team-id',
  tmbId: 'tmb-id',
  name: 'Collection',
  type: 'link',
  dataset: {
    name: 'Dataset',
    type: 'dataset'
  }
};

const getAuditUpdate = () => mocks.updateAuditLogByTaskId.mock.calls.at(-1)?.[0];

describe('POST /api/core/dataset/collection/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseApiInput.mockReturnValue({ body: { collectionId } });
    mocks.authDatasetCollection.mockResolvedValue({
      collection,
      teamId: 'team-id',
      tmbId: 'tmb-id'
    });
    mocks.syncCollection.mockResolvedValue({
      result: 'success',
      collectionId: 'new-collection-id'
    });
    mocks.upsertAuditLogByTaskId.mockResolvedValue(true);
    mocks.updateAuditLogByTaskId.mockResolvedValue(undefined);
    mocks.getI18nDatasetType.mockReturnValue('Dataset');
    mocks.refreshTrainingAuditTask.mockResolvedValue(undefined);
    mocks.randomUUID.mockReturnValue('audit-task-id');
  });

  it('keeps the audit processing while replacement training is queued', async () => {
    await expect(handler({} as never)).resolves.toBe('success');

    expect(mocks.syncCollection).toHaveBeenCalledWith(collection, 'audit-task-id');
    expect(mocks.upsertAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      scope: 'member',
      event: AuditEventEnum.SYNC_DATASET,
      taskId: 'audit-task-id',
      params: expect.objectContaining({
        datasetId: 'dataset-id',
        datasetName: 'Dataset',
        datasetType: 'Dataset',
        result: 'processing',
        sourceFinished: false,
        addedCount: '0',
        updatedCount: '0',
        deletedCount: '0',
        failedCount: '0',
        details: [expect.objectContaining({ result: 'processing' })]
      })
    });
    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'processing',
        metadata: expect.objectContaining({ updatedCount: '1', sourceFinished: true })
      })
    );
    expect(mocks.refreshTrainingAuditTask).toHaveBeenCalledWith('audit-task-id');
  });

  it.each([
    {
      syncResult: 'sameRaw',
      auditResult: 'success',
      detailResult: 'unchanged',
      updatedCount: '0',
      failedCount: '0'
    },
    {
      syncResult: 'failed',
      auditResult: 'failed',
      detailResult: 'failed',
      updatedCount: '0',
      failedCount: '1'
    }
  ])(
    'writes a terminal audit for a $syncResult source result',
    async ({ syncResult, auditResult, detailResult, updatedCount, failedCount }) => {
      mocks.syncCollection.mockResolvedValue({
        result: syncResult,
        collectionId
      });

      await expect(handler({} as never)).resolves.toBe(syncResult);

      const auditUpdate = getAuditUpdate();
      expect(auditUpdate).toMatchObject({
        result: auditResult,
        metadata: expect.objectContaining({
          updatedCount,
          failedCount,
          details: [expect.objectContaining({ result: detailResult })]
        })
      });
      expect(mocks.refreshTrainingAuditTask).toHaveBeenCalledWith('audit-task-id');
    }
  );

  it('records a failed audit when source sync throws', async () => {
    const error = new Error('source unavailable');
    mocks.syncCollection.mockRejectedValue(error);

    await expect(handler({} as never)).rejects.toBe(error);

    expect(getAuditUpdate()).toMatchObject({
      result: 'failed',
      metadata: expect.objectContaining({
        updatedCount: '0',
        failedCount: '1',
        details: [expect.objectContaining({ result: 'failed' })]
      })
    });
    expect(mocks.refreshTrainingAuditTask).toHaveBeenCalledWith('audit-task-id');
  });
});
