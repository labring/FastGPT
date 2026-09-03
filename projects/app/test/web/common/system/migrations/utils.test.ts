import { describe, expect, it } from 'vitest';
import {
  SystemMigrationFailurePolicyEnum,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import type { SystemMigrationListItem } from '@fastgpt/global/migration/schema';
import {
  getSystemMigrationDisplayStatus,
  getSystemMigrationProgressPercent
} from '@/web/common/system/migrations/utils';

const createMigration = (
  input: Partial<SystemMigrationListItem> = {}
): SystemMigrationListItem => ({
  id: '20260903_ui_state',
  version: '4.17.0',
  order: 1,
  nameKey: 'system_migration:migrations.example.name',
  descriptionKey: 'system_migration:migrations.example.description',
  blockStartup: true,
  onFailure: SystemMigrationFailurePolicyEnum.stop,
  status: SystemMigrationStatusEnum.pending,
  progress: [],
  failedRecordCount: 0,
  ...input
});

describe('system migration UI state', () => {
  it('marks an expired running lease as waiting for takeover', () => {
    const migration = createMigration({
      status: SystemMigrationStatusEnum.running,
      leaseExpireAt: new Date('2026-09-03T10:00:00.000Z')
    });

    expect(
      getSystemMigrationDisplayStatus({
        migration,
        serverTime: '2026-09-03T10:00:01.000Z'
      })
    ).toBe('reclaiming');
    expect(
      getSystemMigrationDisplayStatus({
        migration,
        serverTime: '2026-09-03T09:59:59.000Z'
      })
    ).toBe(SystemMigrationStatusEnum.running);
    expect(
      getSystemMigrationDisplayStatus({
        migration: { ...migration, leaseExpireAt: undefined },
        serverTime: '2026-09-03T10:00:01.000Z'
      })
    ).toBe('reclaiming');
  });

  it('bounds deterministic progress and omits an unknown total', () => {
    expect(
      getSystemMigrationProgressPercent({
        key: 'test_progress',
        labelKey: 'system_migration:migrations.example.progress',
        status: SystemMigrationStatusEnum.running,
        current: 12,
        total: 10,
        updatedAt: new Date()
      })
    ).toBe(100);
    expect(
      getSystemMigrationProgressPercent({
        key: 'test_progress',
        labelKey: 'system_migration:migrations.example.progress',
        status: SystemMigrationStatusEnum.running,
        current: 12,
        updatedAt: new Date()
      })
    ).toBeUndefined();
  });
});
