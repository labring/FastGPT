import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SystemMigrationFailurePolicyEnum,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  getSystemMigrationFailedRecords: vi.fn(),
  getSystemMigrationList: vi.fn(),
  retryNonBlockingSystemMigration: vi.fn(),
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
  retryNonBlockingSystemMigration: mocks.retryNonBlockingSystemMigration
}));
vi.mock('@/migration/runner', () => ({
  wakeSystemMigrationRunner: mocks.wakeSystemMigrationRunner
}));

import failedRecordsHandler from '@/pages/api/admin/migrations/failedRecords';
import listHandler from '@/pages/api/admin/migrations/list';
import retryHandler from '@/pages/api/admin/migrations/retry';

describe('system migration admin APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
  });

  it('authenticates root and returns the validated ordered list', async () => {
    const response = {
      serverTime: new Date(),
      businessReady: false,
      migrations: [
        {
          id: '20260903_api_task',
          version: '4.17.0',
          order: 1,
          nameKey: 'system_migration:migrations.api.name',
          descriptionKey: 'system_migration:migrations.api.description',
          blockStartup: true,
          onFailure: SystemMigrationFailurePolicyEnum.stop,
          status: SystemMigrationStatusEnum.running,
          progress: [],
          failedRecordCount: 0
        }
      ]
    };
    mocks.getSystemMigrationList.mockResolvedValue(response);
    const req = { headers: {} } as any;

    await expect(listHandler(req)).resolves.toEqual(response);
    expect(mocks.authSystemAdmin).toHaveBeenCalledWith({ req });
  });

  it('does not reach the service when root authentication fails', async () => {
    mocks.authSystemAdmin.mockRejectedValue(new Error('unAuthorization'));

    await expect(listHandler({ headers: {} } as any)).rejects.toThrow('unAuthorization');
    expect(mocks.getSystemMigrationList).not.toHaveBeenCalled();
  });

  it('validates and retries a failed non-blocking migration as system admin', async () => {
    const req = {
      headers: {},
      body: { migrationId: '20260903_non_blocking' }
    } as any;

    await expect(retryHandler(req)).resolves.toBeUndefined();
    expect(mocks.authSystemAdmin).toHaveBeenCalledWith({ req });
    expect(mocks.retryNonBlockingSystemMigration).toHaveBeenCalledWith('20260903_non_blocking');
    expect(mocks.wakeSystemMigrationRunner).toHaveBeenCalledTimes(1);
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

    await expect(failedRecordsHandler(req)).resolves.toEqual(response);
    expect(mocks.authSystemAdmin).toHaveBeenCalledWith({ req });
    expect(mocks.getSystemMigrationFailedRecords).toHaveBeenCalledWith(
      response.migrationId,
      response.stageKey
    );
  });

  it('rejects an invalid retry body before calling the service', async () => {
    await expect(retryHandler({ headers: {}, body: {} } as any)).rejects.toThrow();
    expect(mocks.retryNonBlockingSystemMigration).not.toHaveBeenCalled();
    expect(mocks.wakeSystemMigrationRunner).not.toHaveBeenCalled();
  });
});
