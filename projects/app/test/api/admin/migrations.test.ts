import startHandler from '@/pages/api/admin/migrations/start';
import { SystemMigrationDependencyError } from '@/migration/error';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  getSystemMigrationFailedRecords: vi.fn(),
  getSystemMigrationList: vi.fn(),
  retrySystemMigration: vi.fn(),
  startManualSystemMigration: vi.fn(),
  wakeSystemMigrationRunner: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));
vi.mock('@/migration/service', () => ({
  getSystemMigrationFailedRecords: mocks.getSystemMigrationFailedRecords,
  getSystemMigrationList: mocks.getSystemMigrationList,
  retrySystemMigration: mocks.retrySystemMigration,
  startManualSystemMigration: mocks.startManualSystemMigration
}));
vi.mock('@/migration/runner', () => ({
  wakeSystemMigrationRunner: mocks.wakeSystemMigrationRunner
}));

import failedRecordsHandler from '@/pages/api/admin/migrations/failedRecords';
import listHandler from '@/pages/api/admin/migrations/list';
import retryHandler from '@/pages/api/admin/migrations/retry';

// NextAPI 已替换为原 handler；这些路径返回业务值，不读取 response。
const unusedResponse = {} as Parameters<typeof listHandler>[1];

describe('system migration admin APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
  });

  it('authenticates root and returns the validated ordered list', async () => {
    const response = {
      serverTime: new Date(),
      migrations: [
        {
          id: '20260903_api_task',
          version: '4.17.0',
          order: 1,
          nameKey: 'system_migration:migrations.api.name',
          descriptionKey: 'system_migration:migrations.api.description',
          blockStartup: false,
          independent: true,
          status: SystemMigrationStatusEnum.running,
          progress: [],
          failedRecordCount: 0
        }
      ]
    };
    mocks.getSystemMigrationList.mockResolvedValue(response);
    const req = { headers: {} } as any;

    await expect(listHandler(req, unusedResponse)).resolves.toEqual(response);
    expect(mocks.authSystemAdmin).toHaveBeenCalledWith({ req });
  });

  it('does not reach the service when root authentication fails', async () => {
    mocks.authSystemAdmin.mockRejectedValue(new Error('unAuthorization'));

    await expect(listHandler({ headers: {} } as any, unusedResponse)).rejects.toThrow(
      'unAuthorization'
    );
    expect(mocks.getSystemMigrationList).not.toHaveBeenCalled();
  });

  it('validates and retries a failed migration as system admin', async () => {
    const req = {
      headers: {},
      body: { migrationId: '20260903_non_blocking' }
    } as any;

    await expect(retryHandler(req, unusedResponse)).resolves.toBeUndefined();
    expect(mocks.authSystemAdmin).toHaveBeenCalledWith({ req });
    expect(mocks.retrySystemMigration).toHaveBeenCalledWith('20260903_non_blocking');
    expect(mocks.wakeSystemMigrationRunner).toHaveBeenCalledTimes(1);
  });

  it('starts a manual task and wakes the runner only after a successful enqueue', async () => {
    const req = { headers: {}, body: { migrationId: '20261008_manual' } } as any;
    await startHandler(req, unusedResponse);
    expect(mocks.authSystemAdmin).toHaveBeenCalledWith({ req });
    expect(mocks.startManualSystemMigration).toHaveBeenCalledWith(req.body.migrationId);
    expect(mocks.wakeSystemMigrationRunner).toHaveBeenCalledTimes(1);
    mocks.wakeSystemMigrationRunner.mockClear();
    mocks.startManualSystemMigration.mockRejectedValueOnce(new Error('already started'));
    await expect(startHandler(req, unusedResponse)).rejects.toThrow('already started');
    expect(mocks.wakeSystemMigrationRunner).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated and malformed manual requests before enqueueing', async () => {
    await expect(startHandler({ headers: {}, body: {} } as any, unusedResponse)).rejects.toThrow();
    mocks.authSystemAdmin.mockRejectedValueOnce(new Error('unAuthorization'));
    await expect(
      startHandler({ headers: {}, body: { migrationId: '20261008_manual' } } as any, unusedResponse)
    ).rejects.toThrow('unAuthorization');
    expect(mocks.startManualSystemMigration).not.toHaveBeenCalled();
    expect(mocks.wakeSystemMigrationRunner).not.toHaveBeenCalled();
  });

  it('loads failed records on demand as system admin', async () => {
    const response = {
      migrationId: '20260903_non_blocking',
      stageKey: 'migrating',
      failedRecords: [
        { stageKey: 'migrating', data: { recordId: 'bad-1' }, reason: { message: 'invalid data' } }
      ]
    };
    mocks.getSystemMigrationFailedRecords.mockResolvedValue(response);
    const req = {
      headers: {},
      query: { migrationId: response.migrationId, stageKey: response.stageKey }
    } as any;

    await expect(failedRecordsHandler(req, unusedResponse)).resolves.toEqual(response);
    expect(mocks.authSystemAdmin).toHaveBeenCalledWith({ req });
    expect(mocks.getSystemMigrationFailedRecords).toHaveBeenCalledWith(
      response.migrationId,
      response.stageKey
    );
  });

  it('rejects an invalid retry body before calling the service', async () => {
    await expect(retryHandler({ headers: {}, body: {} } as any, unusedResponse)).rejects.toThrow();
    expect(mocks.retrySystemMigration).not.toHaveBeenCalled();
    expect(mocks.wakeSystemMigrationRunner).not.toHaveBeenCalled();
  });

  it.each(['start', 'retry'] as const)(
    'returns translatable dependency details without waking the runner on %s',
    async (action) => {
      const prerequisiteNameKey =
        'system_migration:migrations.20261008_migrate_chunk_training.name';
      const service =
        action === 'start' ? mocks.startManualSystemMigration : mocks.retrySystemMigration;
      const handler = action === 'start' ? startHandler : retryHandler;
      service.mockRejectedValueOnce(new SystemMigrationDependencyError(prerequisiteNameKey));
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      await handler({ headers: {}, body: { migrationId: 'dependent' } } as any, res as any);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        code: 409,
        message: 'system_migration:prerequisite_not_succeeded',
        data: { prerequisiteNameKey }
      });
      expect(mocks.wakeSystemMigrationRunner).not.toHaveBeenCalled();
    }
  );
});
