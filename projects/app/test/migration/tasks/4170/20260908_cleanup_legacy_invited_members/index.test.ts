import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import type { SystemMigrationContext } from '@/migration/registry';
import { cleanupLegacyInvitedMembers } from '@/migration/tasks/4170/20260908_cleanup_legacy_invited_members';

/** 仅模拟 runner 的状态能力；业务读写使用隔离测试 Mongo。 */
const createContext = () =>
  ({
    migrationId: '20260908_cleanup_legacy_invited_members',
    runId: 'test',
    signal: new AbortController().signal,
    getCheckpoint: vi.fn(),
    saveCheckpoint: vi.fn(),
    getFailedRecords: vi.fn(),
    reportFailedRecords: vi.fn(),
    reportProgress: vi.fn(),
    assertActive: vi.fn(),
    fail: vi.fn(async (error) => {
      throw new Error(error.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  }) satisfies SystemMigrationContext;
const members = () => connectionMongo.connection.db!.collection('team_members');

beforeEach(async () => {
  vi.restoreAllMocks();
  await members().deleteMany({});
});

describe('cleanupLegacyInvitedMembers', () => {
  it('completes every stage and never reads or saves checkpoints', async () => {
    const context = createContext();
    expect(await cleanupLegacyInvitedMembers(context)).toEqual({
      members: 0,
      permissions: 0,
      groups: 0,
      orgs: 0
    });
    expect(context.reportProgress.mock.calls.map(([p]) => [p.key, p.status])).toEqual([
      ['cleanup', 'running'],
      ['cleanup', 'succeeded'],
      ['validation', 'running'],
      ['validation', 'succeeded']
    ]);
    expect(context.reportFailedRecords).toHaveBeenCalledWith([]);
    expect(context.getCheckpoint).not.toHaveBeenCalled();
    expect(context.saveCheckpoint).not.toHaveBeenCalled();
    expect(context.getFailedRecords).not.toHaveBeenCalled();
  });

  it('reports protected members, clears failures after repair, and retries from the source', async () => {
    const _id = new Types.ObjectId();
    await members().insertOne({
      _id,
      teamId: new Types.ObjectId(),
      status: 'reject',
      role: 'owner'
    });
    const context = createContext();
    await expect(cleanupLegacyInvitedMembers(context)).rejects.toThrow('protected');
    expect(context.fail).toHaveBeenCalledWith(
      expect.objectContaining({ failedRecords: [expect.objectContaining({ stageKey: 'cleanup' })] })
    );
    await members().updateOne({ _id }, { $unset: { role: '' } });
    expect((await cleanupLegacyInvitedMembers(context)).members).toBe(1);
    expect(context.reportFailedRecords).toHaveBeenLastCalledWith([]);
  });

  it('fails completion validation if another legacy member appears after commit', async () => {
    const context = createContext();
    context.reportProgress.mockImplementation(async (progress) => {
      if (progress.key === 'validation' && progress.status === 'running') {
        await members().insertOne({ teamId: new Types.ObjectId(), status: 'waiting' });
      }
    });
    await expect(cleanupLegacyInvitedMembers(context)).rejects.toThrow('remain after cleanup');
    expect(context.reportProgress).not.toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
    });
  });

  it('responds to cancellation without writing', async () => {
    const context = createContext();
    context.signal = AbortSignal.abort(new Error('cancelled'));
    await expect(cleanupLegacyInvitedMembers(context)).rejects.toThrow('cancelled');
  });

  it('safely reruns after committing business changes but failing to persist progress', async () => {
    await members().insertOne({ teamId: new Types.ObjectId(), status: 'waiting' });
    const context = createContext();
    context.reportFailedRecords.mockRejectedValueOnce(new Error('state unavailable'));
    await expect(cleanupLegacyInvitedMembers(context)).rejects.toThrow('state unavailable');
    expect(await members().countDocuments({ status: 'waiting' })).toBe(0);
    expect((await cleanupLegacyInvitedMembers(context)).members).toBe(0);
    expect(context.saveCheckpoint).not.toHaveBeenCalled();
  });
});
