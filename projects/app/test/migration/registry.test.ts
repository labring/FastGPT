import { describe, expect, it } from 'vitest';
import type { SystemMigration } from '@/migration/registry';
import { systemMigrations, validateSystemMigrationRegistry } from '@/migration/registry';

const createMigration = (id: string): SystemMigration => ({
  id,
  version: '4.18.0',
  nameKey: `system_migration:migrations.${id}.name`,
  descriptionKey: `system_migration:migrations.${id}.description`,
  resultKey: `system_migration:migrations.${id}.result`,
  progressSteps: [],
  run: async () => undefined
});

describe('validateSystemMigrationRegistry', () => {
  it('keeps only the current release tasks without legacy startup dependencies', () => {
    expect(systemMigrations.map(({ id }) => id)).toEqual([
      '20261022_initialize_dataset_vector_indexes',
      '20261104_backfill_chat_publish_source',
      '20261104_backfill_openapi_key_type'
    ]);
    expect(
      systemMigrations.filter(
        (task: SystemMigration) =>
          task.blockStartup || task.manual || task.delay || task.dependsOn?.length
      )
    ).toEqual([]);
    expect(() => validateSystemMigrationRegistry(systemMigrations)).not.toThrow();
  });

  it('appends dataset index initialization as a non-blocking automatic task', () => {
    const task = systemMigrations.find(
      ({ id }) => id === '20261022_initialize_dataset_vector_indexes'
    );
    expect(task).toMatchObject({
      id: '20261022_initialize_dataset_vector_indexes',
      version: '4.18.0',
      blockStartup: false,
      progressSteps: [{ key: 'legacyIndex' }, { key: 'datasets' }]
    });
    expect(task).not.toHaveProperty('manual');
    expect(task).not.toHaveProperty('independent');
    expect(task).not.toHaveProperty('dependsOn');
    expect(task).not.toHaveProperty('onFailure');
  });

  it('在4.18.0末尾登记独立自动 Key 类型回填，保持启动非阻塞且无依赖', () => {
    const task = systemMigrations.at(-1);
    expect(task).toMatchObject({
      id: '20261104_backfill_openapi_key_type',
      version: '4.18.0',
      independent: true,
      progressSteps: [{ key: 'keys' }, { key: 'validation' }]
    });
    expect(task).not.toHaveProperty('blockStartup', true);
    expect(task).not.toHaveProperty('dependsOn');
    expect(task).not.toHaveProperty('manual');
    expect(task).not.toHaveProperty('delay');
  });

  it('runs only the selected production tasks independently', () => {
    const independentTasks = systemMigrations.filter((task: SystemMigration) => task.independent);
    expect(independentTasks.map((task) => task.id)).toEqual([
      '20261104_backfill_chat_publish_source',
      '20261104_backfill_openapi_key_type'
    ]);
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
