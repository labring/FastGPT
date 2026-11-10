import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemMigrationContext } from '@/migration/registry';

const mocks = vi.hoisted(() => ({ backfill: vi.fn(), verify: vi.fn() }));
vi.mock('@/migration/tasks/4180/20261110_backfill_external_file_check/service', () => ({
  backfillExternalFileCheck: mocks.backfill,
  verifyExternalFileCheck: mocks.verify
}));
import { backfillExternalFileCheckTask } from '@/migration/tasks/4180/20261110_backfill_external_file_check';

const createContext = () =>
  ({ reportProgress: vi.fn(), assertActive: vi.fn() }) as unknown as SystemMigrationContext;

describe('backfillExternalFileCheckTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backfill.mockResolvedValue({ updatedDocuments: 1 });
    mocks.verify.mockResolvedValue(undefined);
  });

  it('reports both stages and returns a bounded migration result', async () => {
    const context = createContext();
    expect(await backfillExternalFileCheckTask(context)).toEqual({ updatedDocuments: 1 });
    expect(mocks.backfill).toHaveBeenCalledWith({ assertActive: context.assertActive });
    expect(vi.mocked(context.reportProgress).mock.calls.map(([p]) => [p.key, p.status])).toEqual([
      ['backfill', 'running'],
      ['backfill', 'succeeded'],
      ['validation', 'running'],
      ['validation', 'succeeded']
    ]);
  });

  it('does not mark validation succeeded when completion cannot be proven', async () => {
    mocks.verify.mockRejectedValue(new Error('incomplete'));
    const context = createContext();
    await expect(backfillExternalFileCheckTask(context)).rejects.toThrow('incomplete');
    expect(context.reportProgress).not.toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
    });
  });
});
