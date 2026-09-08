import { describe, expect, it } from 'vitest';
import { SystemMigrationFailurePolicyEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigration } from '@/migration/registry';
import { systemMigrations, validateSystemMigrationRegistry } from '@/migration/registry';

const createMigration = (id: string): SystemMigration => ({
  id,
  version: '4.17.0',
  nameKey: `system_migration:migrations.${id}.name`,
  descriptionKey: `system_migration:migrations.${id}.description`,
  resultKey: `system_migration:migrations.${id}.result`,
  progressSteps: [],
  blockStartup: false,
  onFailure: SystemMigrationFailurePolicyEnum.stop,
  run: async () => undefined
});

describe('validateSystemMigrationRegistry', () => {
  it('registers team member role cleanup as the first blocking production task', () => {
    expect(systemMigrations[0]).toMatchObject({
      id: '20260907_cleanup_team_member_roles',
      version: '4.17.0',
      blockStartup: true,
      onFailure: SystemMigrationFailurePolicyEnum.stop,
      progressSteps: [{ key: 'members' }, { key: 'validation' }]
    });
    expect(systemMigrations.slice(2).map((migration) => migration.id)).toEqual([
      '20260903_backfill_model_permissions',
      '20260903_backfill_dataset_model_references',
      '20260903_backfill_evaluation_model_references',
      '20260903_backfill_app_model_references',
      '20260903_backfill_resource_create_time',
      '20260905_backfill_bill_metadata',
      '20260905_backfill_resource_owner_acl',
      '20260908_cleanup_legacy_invited_members'
    ]);
    expect(systemMigrations.slice(2).every((migration) => !migration.blockStartup)).toBe(true);
    expect(
      systemMigrations
        .slice(2)
        .every((migration) => migration.onFailure === SystemMigrationFailurePolicyEnum.continue)
    ).toBe(true);
    expect(systemMigrations[1]).toMatchObject({
      id: '20260903_migrate_legacy_system_models',
      version: '4.17.0',
      blockStartup: true,
      onFailure: SystemMigrationFailurePolicyEnum.stop
    });
  });

  it('accepts an ordered registry with stable IDs', () => {
    expect(() =>
      validateSystemMigrationRegistry([
        createMigration('20260903_add_example_field'),
        createMigration('20260904_backfill_example_field')
      ])
    ).not.toThrow();
  });

  it('rejects duplicate IDs', () => {
    expect(() =>
      validateSystemMigrationRegistry([
        createMigration('20260903_add_example_field'),
        createMigration('20260903_add_example_field')
      ])
    ).toThrow('Duplicate system migration id');
  });

  it('rejects a blocking migration that continues after failure', () => {
    expect(() =>
      validateSystemMigrationRegistry([
        {
          ...createMigration('20260903_invalid_failure_policy'),
          blockStartup: true,
          onFailure: SystemMigrationFailurePolicyEnum.continue
        }
      ])
    ).toThrow('must stop following migrations');
  });

  it.each(['migration_1', '2026-09-03_bad', '20260903_Uppercase'])(
    'rejects unstable migration ID %s',
    (id) => {
      expect(() => validateSystemMigrationRegistry([createMigration(id)])).toThrow(
        'Invalid system migration id'
      );
    }
  );
});
