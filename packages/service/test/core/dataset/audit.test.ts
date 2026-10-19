import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const mocks = vi.hoisted(() => ({
  addAuditLog: vi.fn(),
  failAuditLogByTaskId: vi.fn(),
  updateAuditLogByTaskId: vi.fn(),
  refreshTrainingAuditTask: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: mocks.addAuditLog,
  failAuditLogByTaskId: mocks.failAuditLogByTaskId,
  updateAuditLogByTaskId: mocks.updateAuditLogByTaskId
}));
vi.mock('@fastgpt/service/core/dataset/training/audit', () => ({
  refreshTrainingAuditTask: mocks.refreshTrainingAuditTask
}));

describe('startCollectionImportAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addAuditLog.mockResolvedValue(undefined);
    mocks.updateAuditLogByTaskId.mockResolvedValue(undefined);
    mocks.refreshTrainingAuditTask.mockResolvedValue(undefined);
  });

  it('creates a processing batch audit and finishes it with a CAS update', async () => {
    const { startDatasetImportAudit } = await import('@fastgpt/service/core/dataset/audit');
    const audit = await startDatasetImportAudit({
      taskId: 'batch-audit-task-id',
      teamId: 'team-id',
      tmbId: 'member-id',
      datasetId: 'dataset-id',
      datasetName: 'Dataset',
      collectionName: 'dataset_files',
      sourceType: 'file',
      insertLen: '2',
      details: [
        {
          resourceName: 'one.pdf',
          resourceType: 'collection',
          sourceType: 'file',
          action: 'import',
          result: 'processing'
        }
      ]
    });

    await audit.finish({
      result: 'processing',
      insertLen: '2',
      successCount: '2',
      failedCount: '0',
      sourceFailedCount: '0',
      details: []
    });

    expect(mocks.addAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          result: 'processing',
          sourceFinished: false,
          taskId: 'batch-audit-task-id'
        })
      })
    );
    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'batch-audit-task-id',
      scope: 'member',
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      result: 'processing',
      expectedResult: 'processing',
      metadata: {
        insertLen: '2',
        successCount: '2',
        failedCount: '0',
        sourceFinished: true,
        sourceFailedCount: '0',
        details: []
      }
    });
  });

  it('requires a processing audit when binding its collection', async () => {
    const { startCollectionImportAudit } = await import('@fastgpt/service/core/dataset/audit');
    const audit = await startCollectionImportAudit({
      enabled: true,
      taskId: 'audit-task-id',
      teamId: 'team-id',
      tmbId: 'member-id',
      datasetId: 'dataset-id',
      datasetName: 'Dataset',
      collectionName: 'Collection',
      trainingType: DatasetCollectionDataProcessModeEnum.chunk,
      chunkSize: 1024,
      indexSize: 512
    });

    await audit.bindCollection('collection-id');

    expect(mocks.addAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ sourceFinished: false })
      })
    );
    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'audit-task-id',
      scope: 'member',
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      result: 'processing',
      expectedResult: 'processing',
      metadata: {
        details: [
          expect.objectContaining({
            resourceId: 'collection-id',
            result: 'processing'
          })
        ],
        successCount: '1',
        sourceFinished: true
      }
    });
    expect(mocks.refreshTrainingAuditTask).toHaveBeenCalledWith('audit-task-id');
  });
});
