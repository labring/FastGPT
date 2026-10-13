import { describe, expect, it } from 'vitest';
import { systemMigrationLimits, SystemMigrationStatusEnum } from '../../migration/constants';
import {
  SystemMigrationFailureInputSchema,
  SystemMigrationProgressInputSchema
} from '../../migration/schema';

describe('system migration input schemas', () => {
  it('accepts a bounded progress data snapshot', () => {
    expect(
      SystemMigrationProgressInputSchema.parse({
        key: 'system_migration:migrations.example.progress',
        status: SystemMigrationStatusEnum.running,
        params: { collection: 'apps', phase: 2 },
        current: 5,
        total: 10
      })
    ).toEqual({
      key: 'system_migration:migrations.example.progress',
      status: SystemMigrationStatusEnum.running,
      params: { collection: 'apps', phase: 2 },
      current: 5,
      total: 10
    });
  });

  it('accepts structured failed records with per-record reasons', () => {
    expect(
      SystemMigrationFailureInputSchema.parse({
        message: 'Some records could not be migrated',
        failedRecords: [
          {
            stageKey: 'migrating',
            data: { collection: 'apps', recordId: 'app-1' },
            reason: {
              message: 'Invalid model reference'
            }
          }
        ]
      }).failedRecords
    ).toHaveLength(1);
  });

  it('keeps only raw messages in persisted failure input', () => {
    expect(
      SystemMigrationFailureInputSchema.parse({
        key: 'system_migration:errors.invalid_record',
        params: { field: 'modelId' },
        message: 'Invalid model reference'
      })
    ).toEqual({ message: 'Invalid model reference' });
  });

  it('rejects progress beyond total and oversized params', () => {
    expect(() =>
      SystemMigrationProgressInputSchema.parse({
        key: 'system_migration:migrations.example.progress',
        status: SystemMigrationStatusEnum.running,
        current: 11,
        total: 10
      })
    ).toThrow('Progress current cannot be greater than total');

    const params = Object.fromEntries(
      Array.from({ length: systemMigrationLimits.maxDataEntries + 1 }, (_, index) => [
        `key-${index}`,
        index
      ])
    );
    expect(() =>
      SystemMigrationProgressInputSchema.parse({
        key: 'system_migration:migrations.example.progress',
        status: SystemMigrationStatusEnum.running,
        params
      })
    ).toThrow(`more than ${systemMigrationLimits.maxDataEntries} entries`);
  });
});
