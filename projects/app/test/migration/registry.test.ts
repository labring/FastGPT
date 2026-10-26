import { describe, expect, it } from 'vitest';
import type { SystemMigration } from '@/migration/registry';
import { systemMigrations, validateSystemMigrationRegistry } from '@/migration/registry';

const createMigration = (id: string): SystemMigration => ({
  id,
  version: '4.17.0',
  nameKey: `system_migration:migrations.${id}.name`,
  descriptionKey: `system_migration:migrations.${id}.description`,
  resultKey: `system_migration:migrations.${id}.result`,
  progressSteps: [],
  run: async () => undefined
});

describe('validateSystemMigrationRegistry', () => {
  it('preserves the published task order and validates the production registry', () => {
    expect(systemMigrations.map(({ id }) => id)).toEqual([
      '20260907_cleanup_team_member_roles',
      '20260903_migrate_legacy_system_models',
      '20260903_backfill_model_permissions',
      '20260903_backfill_dataset_model_references',
      '20260903_backfill_evaluation_model_references',
      '20260903_backfill_app_model_references',
      '20260903_backfill_resource_create_time',
      '20260905_backfill_bill_metadata',
      '20260905_backfill_resource_owner_acl',
      '20260908_cleanup_legacy_invited_members',
      '20260907_migrate_dataset_tags_v2',
      '20260916_backfill_app_resource_snapshots',
      '20260923_enable_channel_reasoning_mapping',
      '20260928_backfill_member_name_set',
      '20261008_migrate_chunk_training',
      '20261009_migrate_dataset_rebuild_status',
      '20261009_backfill_agent_sandbox_team_id',
      '20261022_backfill_folder_ancestor_ids'
    ]);
    expect(
      systemMigrations.filter((task: SystemMigration) => task.delay).map(({ id }) => id)
    ).toEqual([
      '20260916_backfill_app_resource_snapshots',
      '20260923_enable_channel_reasoning_mapping'
    ]);
    expect(
      systemMigrations.filter((task: SystemMigration) => task.manual).map(({ id }) => id)
    ).toEqual(['20261008_migrate_chunk_training', '20261009_migrate_dataset_rebuild_status']);
    expect(systemMigrations.at(-3)).toMatchObject({
      dependsOn: ['20261008_migrate_chunk_training']
    });
    expect(
      systemMigrations.filter((task: SystemMigration) => task.blockStartup).map(({ id }) => id)
    ).toEqual(['20260903_migrate_legacy_system_models']);
    expect(() => validateSystemMigrationRegistry(systemMigrations)).not.toThrow();
  });

  it('runs only the seven selected production tasks independently', () => {
    const independentTasks = systemMigrations.filter((task: SystemMigration) => task.independent);
    expect(independentTasks.map((task) => task.id)).toEqual([
      '20260907_cleanup_team_member_roles',
      '20260903_backfill_resource_create_time',
      '20260905_backfill_bill_metadata',
      '20260907_migrate_dataset_tags_v2',
      '20260928_backfill_member_name_set',
      '20261009_backfill_agent_sandbox_team_id',
      '20261022_backfill_folder_ancestor_ids'
    ]);
  });

  it('makes the model catalog prerequisite explicit for every model reference task', () => {
    const referenceTasks = systemMigrations.slice(2, 6);
    expect(referenceTasks).toHaveLength(4);
    for (const task of referenceTasks) {
      expect(task).toMatchObject({ dependsOn: ['20260903_migrate_legacy_system_models'] });
    }
    expect(systemMigrations[1]).not.toHaveProperty('dependsOn');
    expect(
      systemMigrations.find((task) => task.id === '20260903_backfill_resource_create_time')
    ).not.toHaveProperty('dependsOn');
    expect(
      systemMigrations.find((task) => task.id === '20260916_backfill_app_resource_snapshots')
    ).toMatchObject({ dependsOn: ['20260903_backfill_app_model_references'] });
  });

  it('rejects delayed manual execution', () => {
    expect(() =>
      validateSystemMigrationRegistry([
        { ...createMigration('20261008_manual'), manual: true, delay: true }
      ])
    ).toThrow('cannot be delayed');
  });

  it.each([{ keys: [''] }, { keys: ['repeated', 'repeated'] }])(
    'rejects invalid progress step keys: $keys',
    ({ keys }) => {
      const migration = {
        ...createMigration('20261008_invalid_progress'),
        progressSteps: keys.map((key) => ({ key, labelKey: 'system_migration:stage' }))
      };
      expect(() => validateSystemMigrationRegistry([migration])).toThrow(
        'Invalid or duplicate progress step key'
      );
    }
  );

  it('accepts an ordered registry with stable IDs', () => {
    expect(() =>
      validateSystemMigrationRegistry([
        createMigration('20260903_add_example_field'),
        {
          ...createMigration('20260904_backfill_example_field'),
          delay: true
        }
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

  it.each(['20260903_missing', '20260903_dependency', '20260904_later'])(
    'rejects a missing, self or later dependency: %s',
    (dependency) => {
      expect(() =>
        validateSystemMigrationRegistry([
          { ...createMigration('20260903_dependency'), dependsOn: [dependency] },
          createMigration('20260904_later')
        ])
      ).toThrow('must depend on an earlier registered task');
    }
  );

  it('accepts independent tasks at any registry position', () => {
    expect(() =>
      validateSystemMigrationRegistry([
        createMigration('20260903_first'),
        { ...createMigration('20260903_independent'), independent: true },
        createMigration('20260903_last')
      ])
    ).not.toThrow();
  });

  it.each([{ manual: true }, { delay: true }, { dependsOn: ['20260903_first'] }])(
    'rejects independent mode with %o',
    (options) => {
      expect(() =>
        validateSystemMigrationRegistry([
          createMigration('20260903_first'),
          { ...createMigration('20260903_independent'), independent: true, ...options }
        ])
      ).toThrow('cannot be manual, delayed or have dependencies');
    }
  );

  it.each(['migration_1', '2026-09-03_bad', '20260903_Uppercase'])(
    'rejects unstable migration ID %s',
    (id) => {
      expect(() => validateSystemMigrationRegistry([createMigration(id)])).toThrow(
        'Invalid system migration id'
      );
    }
  );
});
