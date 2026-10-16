import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  dataExists: vi.fn(),
  trainingFindOne: vi.fn(),
  trainingExists: vi.fn(),
  findOne: vi.fn(),
  auditFind: vi.fn(),
  updateAuditLogByTaskId: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: { exists: mocks.dataExists }
}));
vi.mock('@fastgpt/service/core/dataset/training/schema', () => ({
  MongoDatasetTraining: {
    find: mocks.find,
    findOne: mocks.trainingFindOne,
    exists: mocks.trainingExists
  }
}));
vi.mock('@fastgpt/service/support/user/audit/schema', () => ({
  MongoTeamAudit: { findOne: mocks.findOne, find: mocks.auditFind }
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  updateAuditLogByTaskId: mocks.updateAuditLogByTaskId
}));

const mockAudit = ({
  event,
  count,
  details = [],
  metadata = {}
}: {
  event: AuditEventEnum;
  count: number;
  details?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
}) => {
  mocks.findOne.mockReturnValue({
    lean: vi.fn().mockResolvedValue({
      teamId: 'team-id',
      scope: 'member',
      event,
      metadata: {
        taskId: 'task-id',
        count: String(count),
        insertLen: String(count),
        details,
        ...metadata
      }
    })
  });
};

const mockRemaining = (items: Array<Record<string, unknown>>) => {
  mocks.find.mockReturnValue({
    populate: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(items) })
  });
};

describe('refreshTrainingAuditTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认没有“非最终失败”的剩余任务，直接进入收口
    mocks.dataExists.mockResolvedValue(false);
    mocks.trainingFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });
    mocks.trainingExists.mockResolvedValue(false);
    mocks.auditFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([])
        })
      })
    });
    mockRemaining([]);
  });

  it('does not close the audit before the producer finishes', async () => {
    mockAudit({
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      count: 1,
      metadata: { sourceFinished: false }
    });
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.trainingFindOne).not.toHaveBeenCalled();
    expect(mocks.updateAuditLogByTaskId).not.toHaveBeenCalled();
  });

  it('keeps the event processing while retryable tasks remain', async () => {
    mockAudit({ event: AuditEventEnum.RETRY_TRAINING, count: 1 });
    // 仍有未终态失败的训练任务时不做收口，也不读取失败明细
    mocks.trainingFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'pending-training' })
    });
    mockRemaining([
      {
        _id: 'training-1',
        collectionId: 'collection-1',
        retryCount: 2,
        lockTime: new Date('2000-01-01'),
        errorMsg: 'temporary'
      }
    ]);
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.updateAuditLogByTaskId).not.toHaveBeenCalled();
  });

  it('does not refresh an audit that is already terminal', async () => {
    mockAudit({
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      count: 3,
      metadata: { result: 'failed' }
    });
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.trainingFindOne).not.toHaveBeenCalled();
    expect(mocks.updateAuditLogByTaskId).not.toHaveBeenCalled();
  });

  it('marks a completed task as successful', async () => {
    mockAudit({ event: AuditEventEnum.IMPORT_DATASET_CONTENT, count: 3 });
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'task-id',
      scope: 'member',
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      result: 'success',
      expectedResult: 'processing',
      metadata: { successCount: '3', failedCount: '0' }
    });
  });

  it('drops malformed persisted details before updating audit', async () => {
    mockAudit({
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      count: 1,
      details: [{ resourceName: 'legacy item' }]
    });
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'task-id',
      scope: 'member',
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      result: 'success',
      expectedResult: 'processing',
      metadata: { successCount: '1', failedCount: '0' }
    });
  });

  it('preserves source sync failures when no training task failed', async () => {
    mockAudit({
      event: AuditEventEnum.SYNC_DATASET,
      count: 2,
      details: [
        {
          resourceId: 'updated-1',
          resourceName: 'Updated collection',
          resourceType: 'collection',
          action: 'update',
          result: 'failed'
        },
        {
          resourceId: 'added-1',
          resourceName: 'Added collection',
          resourceType: 'collection',
          action: 'add',
          result: 'added'
        }
      ],
      metadata: {
        addedCount: '1',
        updatedCount: '0',
        failedCount: '1',
        sourceFailedCount: '1'
      }
    });
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'task-id',
      scope: 'member',
      event: AuditEventEnum.SYNC_DATASET,
      result: 'partial_failed',
      expectedResult: 'processing',
      metadata: {
        successCount: '1',
        failedCount: '1',
        sourceFailedCount: '1',
        trainingFailedCount: '0',
        details: [
          {
            resourceId: 'updated-1',
            resourceName: 'Updated collection',
            resourceType: 'collection',
            action: 'update',
            result: 'failed'
          },
          {
            resourceId: 'added-1',
            resourceName: 'Added collection',
            resourceType: 'collection',
            action: 'add',
            result: 'added'
          }
        ]
      }
    });
  });

  it('counts deleted sync collections as successful operations', async () => {
    mockAudit({
      event: AuditEventEnum.SYNC_DATASET,
      count: 0,
      metadata: {
        addedCount: '0',
        updatedCount: '0',
        deletedCount: '5',
        failedCount: '0',
        sourceFailedCount: '0'
      }
    });
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'task-id',
      scope: 'member',
      event: AuditEventEnum.SYNC_DATASET,
      result: 'success',
      expectedResult: 'processing',
      metadata: {
        successCount: '5',
        failedCount: '0',
        sourceFailedCount: '0',
        trainingFailedCount: '0'
      }
    });
  });

  it('keeps deleted sync collections successful when another source operation fails', async () => {
    mockAudit({
      event: AuditEventEnum.SYNC_DATASET,
      count: 0,
      metadata: {
        addedCount: '0',
        updatedCount: '0',
        deletedCount: '5',
        failedCount: '1',
        sourceFailedCount: '1'
      }
    });
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'task-id',
      scope: 'member',
      event: AuditEventEnum.SYNC_DATASET,
      result: 'partial_failed',
      expectedResult: 'processing',
      metadata: {
        successCount: '5',
        failedCount: '1',
        sourceFailedCount: '1',
        trainingFailedCount: '0'
      }
    });
  });

  it('preserves source import failures when no training task failed', async () => {
    mockAudit({
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      count: 2,
      details: [
        {
          resourceId: 'folder-1',
          resourceName: 'Broken folder',
          resourceType: 'folder',
          action: 'import',
          result: 'failed'
        },
        {
          resourceId: 'file-1',
          resourceName: 'Imported file',
          resourceType: 'collection',
          action: 'import',
          result: 'processing'
        }
      ],
      metadata: {
        successCount: '2',
        failedCount: '1',
        sourceFailedCount: '1'
      }
    });
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'task-id',
      scope: 'member',
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      result: 'partial_failed',
      expectedResult: 'processing',
      metadata: {
        successCount: '2',
        failedCount: '1',
        details: [
          {
            resourceId: 'folder-1',
            resourceName: 'Broken folder',
            resourceType: 'folder',
            action: 'import',
            result: 'failed'
          },
          {
            resourceId: 'file-1',
            resourceName: 'Imported file',
            resourceType: 'collection',
            action: 'import',
            result: 'success'
          }
        ]
      }
    });
  });

  it('counts training failures for updated sync operations', async () => {
    mockAudit({
      event: AuditEventEnum.SYNC_DATASET,
      count: 1,
      details: [
        {
          resourceId: 'updated-1',
          resourceName: 'Updated collection',
          resourceType: 'collection',
          action: 'update',
          result: 'success'
        }
      ],
      metadata: {
        addedCount: '0',
        updatedCount: '1',
        failedCount: '0',
        sourceFailedCount: '0'
      }
    });
    mockRemaining([
      {
        _id: 'training-1',
        collectionId: 'updated-1',
        retryCount: 0,
        lockTime: new Date('2000-01-01'),
        errorMsg: 'embedding failed'
      }
    ]);
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'task-id',
      scope: 'member',
      event: AuditEventEnum.SYNC_DATASET,
      result: 'failed',
      expectedResult: 'processing',
      metadata: {
        successCount: '0',
        failedCount: '1',
        sourceFailedCount: '0',
        trainingFailedCount: '1',
        details: [
          {
            resourceId: 'updated-1',
            resourceName: 'Updated collection',
            resourceType: 'collection',
            action: 'update',
            result: 'failed',
            failureReason: 'embedding failed'
          }
        ]
      }
    });
  });

  it('marks a failed dataset sync collection as failed', async () => {
    mockAudit({
      event: AuditEventEnum.SYNC_DATASET,
      count: 1,
      details: [
        {
          resourceId: 'collection-1',
          resourceName: 'page.html',
          resourceType: 'collection',
          action: 'add',
          result: 'added'
        }
      ],
      metadata: {
        addedCount: '1',
        updatedCount: '0',
        failedCount: '0',
        sourceFailedCount: '0'
      }
    });
    mockRemaining([
      {
        _id: 'training-1',
        collectionId: 'collection-1',
        retryCount: 0,
        lockTime: new Date('2000-01-01'),
        errorMsg: 'embedding failed'
      }
    ]);
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'task-id',
      scope: 'member',
      event: AuditEventEnum.SYNC_DATASET,
      result: 'failed',
      expectedResult: 'processing',
      metadata: {
        successCount: '0',
        failedCount: '1',
        sourceFailedCount: '0',
        trainingFailedCount: '1',
        details: [
          {
            resourceId: 'collection-1',
            resourceName: 'page.html',
            resourceType: 'collection',
            action: 'add',
            result: 'failed',
            failureReason: 'embedding failed'
          }
        ]
      }
    });
  });

  it('counts retry failures by training object', async () => {
    mockAudit({ event: AuditEventEnum.RETRY_TRAINING, count: 5 });
    mockRemaining([
      {
        _id: 'training-1',
        collectionId: 'collection-1',
        retryCount: 0,
        lockTime: new Date('2000-01-01'),
        errorMsg: 'first failure'
      },
      {
        _id: 'training-2',
        collectionId: 'collection-1',
        retryCount: 0,
        lockTime: new Date('2000-01-01'),
        errorMsg: 'second failure'
      }
    ]);
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'partial_failed',
        metadata: expect.objectContaining({ successCount: '3', failedCount: '2' })
      })
    );
  });

  it('keeps a partially submitted retry audit processing while active tasks remain', async () => {
    mockAudit({
      event: AuditEventEnum.RETRY_TRAINING,
      count: 3,
      details: [
        {
          resourceId: 'deleted-task',
          resourceName: 'Deleted task',
          resourceType: 'training_record',
          action: 'retry',
          result: 'processing'
        },
        {
          resourceId: 'active-task',
          resourceName: 'Active task',
          resourceType: 'training_record',
          action: 'retry',
          result: 'processing'
        },
        {
          resourceId: 'failed-task',
          resourceName: 'Failed task',
          resourceType: 'training_record',
          action: 'retry',
          result: 'processing'
        }
      ]
    });
    mocks.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'active-task',
          retryCount: 2,
          lockTime: new Date('2000-01-01'),
          errorMsg: 'temporary failure'
        },
        {
          _id: 'failed-task',
          retryCount: 0,
          lockTime: new Date('2000-01-01'),
          errorMsg: 'permanent failure'
        }
      ])
    });
    const { recoverRetryTrainingAuditAfterProducerFailure } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await recoverRetryTrainingAuditAfterProducerFailure({
      teamId: 'team-id',
      auditTaskId: 'task-id',
      taskIds: ['deleted-task', 'active-task', 'failed-task'],
      trainingScope: { teamId: 'team-id', datasetId: 'dataset-id' },
      failureReason: 'second batch failed'
    });

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'task-id',
      scope: 'member',
      event: AuditEventEnum.RETRY_TRAINING,
      result: 'processing',
      expectedResult: 'processing',
      metadata: {
        sourceFinished: true,
        successCount: '1',
        failedCount: '1',
        failureReason: 'second batch failed',
        details: [
          expect.objectContaining({ resourceId: 'deleted-task', result: 'success' }),
          expect.objectContaining({ resourceId: 'active-task', result: 'processing' }),
          expect.objectContaining({
            resourceId: 'failed-task',
            result: 'failed',
            failureReason: 'permanent failure'
          })
        ]
      }
    });
  });

  it('closes a partially submitted retry audit with deleted tasks successful', async () => {
    mockAudit({
      event: AuditEventEnum.RETRY_TRAINING,
      count: 2,
      details: [
        {
          resourceId: 'deleted-task',
          resourceName: 'Deleted task',
          resourceType: 'training_record',
          action: 'retry',
          result: 'processing'
        },
        {
          resourceId: 'failed-task',
          resourceName: 'Failed task',
          resourceType: 'training_record',
          action: 'retry',
          result: 'processing'
        }
      ]
    });
    mocks.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'failed-task',
          retryCount: 0,
          lockTime: new Date('2000-01-01'),
          errorMsg: 'permanent failure'
        }
      ])
    });
    const { recoverRetryTrainingAuditAfterProducerFailure } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await recoverRetryTrainingAuditAfterProducerFailure({
      teamId: 'team-id',
      auditTaskId: 'task-id',
      taskIds: ['deleted-task', 'failed-task'],
      trainingScope: { teamId: 'team-id', datasetId: 'dataset-id' },
      failureReason: 'second batch failed'
    });

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'partial_failed',
        metadata: expect.objectContaining({ successCount: '1', failedCount: '1' })
      })
    );
  });

  it('counts multiple failed chunks in one imported collection as one failed item', async () => {
    mockAudit({
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      count: 3,
      details: [
        {
          resourceId: 'collection-1',
          resourceName: 'file.pdf',
          resourceType: 'collection',
          action: 'import',
          result: 'processing'
        }
      ]
    });
    mockRemaining(
      Array.from({ length: 5 }, (_, index) => ({
        _id: `chunk-${index}`,
        collectionId: 'collection-1',
        retryCount: 0,
        lockTime: new Date('2000-01-01'),
        errorMsg: 'embedding failed'
      }))
    );
    const { refreshTrainingAuditTask } =
      await import('@fastgpt/service/core/dataset/training/audit');

    await refreshTrainingAuditTask('task-id');

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'partial_failed',
        metadata: expect.objectContaining({ successCount: '2', failedCount: '1' })
      })
    );
  });

  it('flushes each audit task id periodically and on queue stop', async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn().mockResolvedValue(undefined);
      const { createTrainingAuditTaskFlusher } =
        await import('@fastgpt/service/core/dataset/training/auditTaskFlusher');
      const flusher = createTrainingAuditTaskFlusher(refresh);

      flusher.add('task-a');
      flusher.add('task-a');
      await vi.advanceTimersByTimeAsync(5_000);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledWith('task-a');

      flusher.add('task-b');
      await flusher.stop();
      expect(refresh).toHaveBeenCalledTimes(2);
      expect(refresh).toHaveBeenLastCalledWith('task-b');
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers a stale audit after all its training records finish', async () => {
    mocks.auditFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              teamId: 'team-id',
              scope: 'member',
              event: AuditEventEnum.IMPORT_DATASET_CONTENT,
              metadata: { taskId: 'stale-task', sourceFinished: false }
            }
          ])
        })
      })
    });
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(null)
    });
    mocks.trainingExists.mockResolvedValue({ _id: 'finished-training' });
    const { reconcileStaleTrainingAudits } =
      await import('@fastgpt/service/core/dataset/training/auditReconcile');

    await expect(reconcileStaleTrainingAudits()).resolves.toBe(1);

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'stale-task',
      scope: 'member',
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      result: 'processing',
      expectedResult: 'processing',
      metadata: { sourceFinished: true }
    });
  });

  it('recovers a stale rebuild audit after all rebuild data is indexed', async () => {
    mocks.auditFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              teamId: 'team-id',
              scope: 'member',
              event: AuditEventEnum.REBUILD_DATASET_INDEX,
              metadata: {
                taskId: 'stale-rebuild-task',
                datasetId: 'dataset-id',
                count: '12',
                sourceFinished: false
              }
            }
          ])
        })
      })
    });
    const { reconcileStaleTrainingAudits } =
      await import('@fastgpt/service/core/dataset/training/auditReconcile');

    await expect(reconcileStaleTrainingAudits()).resolves.toBe(1);

    expect(mocks.dataExists).toHaveBeenCalledWith({
      teamId: 'team-id',
      datasetId: 'dataset-id',
      indexStatus: {
        $in: ['rebuildIndexPending', 'rebuildIndexRunning']
      }
    });
    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'stale-rebuild-task',
      scope: 'member',
      event: AuditEventEnum.REBUILD_DATASET_INDEX,
      result: 'processing',
      expectedResult: 'processing',
      metadata: { sourceFinished: true }
    });
  });

  it('marks a stale rebuild audit failed when rebuild data has no training task', async () => {
    mocks.auditFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              teamId: 'team-id',
              scope: 'member',
              event: AuditEventEnum.REBUILD_DATASET_INDEX,
              metadata: {
                taskId: 'orphan-rebuild-task',
                datasetId: 'dataset-id',
                count: '12',
                sourceFinished: false
              }
            }
          ])
        })
      })
    });
    mocks.dataExists.mockResolvedValue(true);
    const { reconcileStaleTrainingAudits } =
      await import('@fastgpt/service/core/dataset/training/auditReconcile');

    await expect(reconcileStaleTrainingAudits()).resolves.toBe(1);

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'orphan-rebuild-task',
      scope: 'member',
      event: AuditEventEnum.REBUILD_DATASET_INDEX,
      result: 'failed',
      expectedResult: 'processing',
      metadata: {
        sourceFinished: true,
        successCount: '0',
        failedCount: '12',
        failureReason: 'Rebuild data has no recoverable training task'
      }
    });
  });

  it('marks a stale rebuild audit failed when failed data has no training task', async () => {
    mocks.auditFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              teamId: 'team-id',
              scope: 'member',
              event: AuditEventEnum.REBUILD_DATASET_INDEX,
              metadata: {
                taskId: 'failed-rebuild-task',
                datasetId: 'dataset-id',
                count: '12',
                sourceFinished: false
              }
            }
          ])
        })
      })
    });
    mocks.dataExists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { reconcileStaleTrainingAudits } =
      await import('@fastgpt/service/core/dataset/training/auditReconcile');

    await expect(reconcileStaleTrainingAudits()).resolves.toBe(1);

    expect(mocks.dataExists).toHaveBeenNthCalledWith(2, {
      teamId: 'team-id',
      datasetId: 'dataset-id',
      indexStatus: 'rebuildIndexFailed'
    });
    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'failed-rebuild-task',
      scope: 'member',
      event: AuditEventEnum.REBUILD_DATASET_INDEX,
      result: 'failed',
      expectedResult: 'processing',
      metadata: {
        sourceFinished: true,
        successCount: '0',
        failedCount: '12',
        failureReason: 'Rebuild data has failed index status'
      }
    });
  });

  it('marks a stale retry audit failed when no task was bound', async () => {
    mocks.auditFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              teamId: 'team-id',
              scope: 'member',
              event: AuditEventEnum.RETRY_TRAINING,
              metadata: {
                taskId: 'stale-retry-task',
                count: '1',
                sourceFinished: false,
                details: [
                  {
                    resourceId: 'training-1',
                    resourceName: 'Training task',
                    resourceType: 'training_record',
                    action: 'retry',
                    result: 'processing'
                  }
                ]
              }
            }
          ])
        })
      })
    });
    const { reconcileStaleTrainingAudits } =
      await import('@fastgpt/service/core/dataset/training/auditReconcile');

    await expect(reconcileStaleTrainingAudits()).resolves.toBe(1);

    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledTimes(1);
    expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
      teamId: 'team-id',
      taskId: 'stale-retry-task',
      scope: 'member',
      event: AuditEventEnum.RETRY_TRAINING,
      result: 'failed',
      expectedResult: 'processing',
      metadata: {
        successCount: '0',
        failedCount: '1',
        failureReason:
          'Source stage did not finish and no recoverable training task remains; operation result is unknown',
        details: [
          {
            resourceId: 'training-1',
            resourceName: 'Training task',
            resourceType: 'training_record',
            action: 'retry',
            result: 'failed',
            failureReason:
              'Source stage did not finish and no recoverable training task remains; operation result is unknown'
          }
        ]
      }
    });
  });

  it.each([AuditEventEnum.IMPORT_DATASET_CONTENT, AuditEventEnum.SYNC_DATASET])(
    'marks a stale %s audit failed when no training record remains',
    async (event) => {
      mocks.auditFind.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([
              {
                teamId: 'team-id',
                scope: 'system',
                event,
                metadata: { taskId: 'stale-source-task', sourceFinished: false }
              }
            ])
          })
        })
      });
      const { reconcileStaleTrainingAudits } =
        await import('@fastgpt/service/core/dataset/training/auditReconcile');

      await expect(reconcileStaleTrainingAudits()).resolves.toBe(1);

      expect(mocks.updateAuditLogByTaskId).toHaveBeenCalledWith({
        teamId: 'team-id',
        taskId: 'stale-source-task',
        scope: 'system',
        event,
        result: 'failed',
        expectedResult: 'processing',
        metadata: {
          successCount: '0',
          failedCount: '1',
          failureReason:
            'Source stage did not finish and no recoverable training task remains; operation result is unknown'
        }
      });
    }
  );

  it('leaves a stale audit alone while retryable training remains', async () => {
    mocks.auditFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              teamId: 'team-id',
              scope: 'member',
              event: AuditEventEnum.IMPORT_DATASET_CONTENT,
              metadata: { taskId: 'active-task' }
            }
          ])
        })
      })
    });
    mocks.trainingFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'active-training' })
    });
    const { reconcileStaleTrainingAudits } =
      await import('@fastgpt/service/core/dataset/training/auditReconcile');

    await expect(reconcileStaleTrainingAudits()).resolves.toBe(0);
    expect(mocks.updateAuditLogByTaskId).not.toHaveBeenCalled();
  });
});
