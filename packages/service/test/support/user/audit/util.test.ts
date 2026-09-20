import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import {
  addAuditLog,
  addAuditLogs,
  failAuditLogByTaskId,
  updateAuditLogByTaskId
} from '@fastgpt/service/support/user/audit/util';

vi.unmock('@fastgpt/service/support/user/audit/util');

const input = {
  teamId: '507f1f77bcf86cd799439011',
  tmbId: '507f1f77bcf86cd799439012',
  scope: 'member',
  event: AuditEventEnum.TRANSFER_TEAM_OWNERSHIP,
  params: { teamName: 'Team', oldOwnerName: 'Old owner', newOwnerName: 'New owner' }
};

describe('addAuditLog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes audit metadata', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockResolvedValue(undefined as never);
    await expect(addAuditLog(input)).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledWith({
      teamId: input.teamId,
      tmbId: input.tmbId,
      scope: 'member',
      event: input.event,
      metadata: input.params
    });
  });

  it('retries temporary write failures', async () => {
    const create = vi
      .spyOn(MongoTeamAudit, 'create')
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue(undefined as never);
    await expect(addAuditLog(input)).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  // 与上游契约一致：写入失败在内部重试并吞错，不把异常抛回业务调用方
  it('handles exhausted retries internally', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockRejectedValue(new Error('unavailable'));
    await expect(addAuditLog(input)).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(4);
  });

  it('treats omitted scope as a member scope for legacy callers', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockResolvedValue(undefined as never);

    await expect(
      addAuditLog({
        teamId: input.teamId,
        tmbId: input.tmbId,
        event: input.event,
        params: input.params
      } as never)
    ).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ scope: 'member' }));
  });

  // 执行主体不合法：丢弃事件并记日志，不写入、不抛异常
  it('drops a member event without tmbId', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockResolvedValue(undefined as never);

    await expect(
      addAuditLog({
        teamId: input.teamId,
        scope: 'member',
        event: input.event
      } as never)
    ).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it('writes system events without a member', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockResolvedValue(undefined as never);

    await expect(
      addAuditLog({
        teamId: input.teamId,
        scope: 'system',
        event: AuditEventEnum.SYNC_DATASET
      })
    ).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledWith({
      teamId: input.teamId,
      scope: 'system',
      event: AuditEventEnum.SYNC_DATASET,
      metadata: undefined
    });
  });

  it('drops a system event that carries a fabricated tmbId', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockResolvedValue(undefined as never);

    await expect(
      addAuditLog({
        teamId: input.teamId,
        scope: 'system',
        tmbId: input.tmbId,
        event: AuditEventEnum.SYNC_DATASET
      } as never)
    ).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it('caps oversized processing details to protect the 16MB document limit', async () => {
    const create = vi.spyOn(MongoTeamAudit, 'create').mockResolvedValue(undefined as never);
    const details = Array.from({ length: 500 }, (_, index) => ({
      resourceId: `resource-${index}`,
      resourceName: `File ${index}`,
      action: 'import',
      result: 'processing'
    }));

    await addAuditLog({
      teamId: input.teamId,
      tmbId: input.tmbId,
      scope: 'member',
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      params: { count: '500', details } as never
    });

    const metadata = vi.mocked(create).mock.calls[0][0].metadata as Record<string, unknown>;
    expect((metadata.details as unknown[]).length).toBe(200);
    expect(metadata.detailsTruncated).toBe(true);
    // 数量统计不受截断影响
    expect(metadata.count).toBe('500');
  });
});

describe('addAuditLogs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates every actor before the batch insert', async () => {
    const insertMany = vi.spyOn(MongoTeamAudit, 'insertMany').mockResolvedValue([] as never);

    await addAuditLogs([
      { teamId: input.teamId, tmbId: input.tmbId, event: AuditEventEnum.CREATE_DATA },
      { teamId: input.teamId, event: AuditEventEnum.CREATE_DATA } as never
    ]);

    expect(insertMany).not.toHaveBeenCalled();
  });

  it('defaults the scope of legacy batch entries to member', async () => {
    const insertMany = vi.spyOn(MongoTeamAudit, 'insertMany').mockResolvedValue([] as never);

    await addAuditLogs([
      { teamId: input.teamId, tmbId: input.tmbId, event: AuditEventEnum.CREATE_DATA }
    ]);

    expect(insertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          teamId: input.teamId,
          tmbId: input.tmbId,
          scope: 'member',
          event: AuditEventEnum.CREATE_DATA
        })
      ],
      { ordered: true }
    );
  });
});

describe('updateAuditLogByTaskId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('propagates task update failures after retries', async () => {
    const updateOne = vi
      .spyOn(MongoTeamAudit, 'updateOne')
      .mockRejectedValue(new Error('audit unavailable'));

    await expect(
      updateAuditLogByTaskId({
        teamId: input.teamId,
        taskId: 'task-id',
        scope: 'member',
        event: AuditEventEnum.RETRY_TRAINING,
        result: 'success'
      })
    ).rejects.toThrow('audit unavailable');
    expect(updateOne).toHaveBeenCalledTimes(4);
  });

  it('rejects updates for a missing audit task', async () => {
    vi.spyOn(MongoTeamAudit, 'updateOne').mockResolvedValue({ matchedCount: 0 } as never);

    await expect(
      updateAuditLogByTaskId({
        teamId: input.teamId,
        taskId: 'missing-task',
        scope: 'member',
        event: AuditEventEnum.RETRY_TRAINING,
        result: 'success'
      })
    ).rejects.toThrow('Audit task not found');
  });
});

describe('failAuditLogByTaskId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks processing details failed with the task failure reason', async () => {
    vi.spyOn(MongoTeamAudit, 'findOne').mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        metadata: {
          details: [
            {
              resourceId: 'resource-1',
              resourceName: 'File',
              action: 'import',
              result: 'processing'
            }
          ]
        }
      })
    } as never);
    const updateOne = vi
      .spyOn(MongoTeamAudit, 'updateOne')
      .mockResolvedValue({ matchedCount: 1 } as never);

    await failAuditLogByTaskId({
      teamId: input.teamId,
      taskId: 'task-id',
      scope: 'member',
      event: AuditEventEnum.IMPORT_DATASET_CONTENT,
      failureReason: 'queue unavailable'
    });

    expect(updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({
          'metadata.result': 'failed',
          'metadata.failureReason': 'queue unavailable',
          'metadata.details': [
            expect.objectContaining({ result: 'failed', failureReason: 'queue unavailable' })
          ]
        })
      })
    );
  });
});
