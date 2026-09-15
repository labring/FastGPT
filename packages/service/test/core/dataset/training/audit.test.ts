import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  countDocuments: vi.fn(),
  findOne: vi.fn(),
  updateAuditLogByTaskId: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/training/schema', () => ({
  MongoDatasetTraining: { find: mocks.find, countDocuments: mocks.countDocuments }
}));
vi.mock('@fastgpt/service/support/user/audit/schema', () => ({
  MongoTeamAudit: { findOne: mocks.findOne }
}));
vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  updateAuditLogByTaskId: mocks.updateAuditLogByTaskId
}));

const mockAudit = ({
  event,
  count,
  details = []
}: {
  event: AuditEventEnum;
  count: number;
  details?: Array<Record<string, unknown>>;
}) => {
  mocks.findOne.mockReturnValue({
    lean: vi.fn().mockResolvedValue({
      teamId: 'team-id',
      scope: 'member',
      event,
      metadata: { taskId: 'task-id', count: String(count), insertLen: String(count), details }
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
    mocks.countDocuments.mockResolvedValue(0);
    mockRemaining([]);
  });

  it('keeps the event processing while retryable tasks remain', async () => {
    mockAudit({ event: AuditEventEnum.RETRY_TRAINING, count: 1 });
    // 仍有未终态失败的训练任务时不做收口，也不读取失败明细
    mocks.countDocuments.mockResolvedValue(1);
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
      metadata: { successCount: '3', failedCount: '0' }
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
});
