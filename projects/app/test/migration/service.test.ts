import { beforeEach, describe, expect, it } from 'vitest';
import {
  SystemMigrationFailurePolicyEnum,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import type { SystemMigration } from '@/migration/registry';
import {
  areBlockingMigrationsComplete,
  getSystemMigrationFailedRecords,
  getSystemMigrationList,
  retryNonBlockingSystemMigration
} from '@/migration/service';
import {
  MongoSystemMigrationFailedRecord,
  MongoSystemMigrationState
} from '@/migration/mongoSchema';

const migrations: readonly SystemMigration[] = [
  {
    id: '20260903_service_first',
    version: '4.17.0',
    nameKey: 'system_migration:migrations.first.name',
    descriptionKey: 'system_migration:migrations.first.description',
    resultKey: 'system_migration:migrations.first.result',
    progressSteps: [{ key: 'migrating', labelKey: 'system_migration:migrations.first.migrating' }],
    blockStartup: false,
    onFailure: SystemMigrationFailurePolicyEnum.continue,
    run: async () => undefined
  },
  {
    id: '20260903_service_blocking',
    version: '4.17.0',
    nameKey: 'system_migration:migrations.blocking.name',
    descriptionKey: 'system_migration:migrations.blocking.description',
    resultKey: 'system_migration:migrations.blocking.result',
    progressSteps: [
      { key: 'finalizing', labelKey: 'system_migration:migrations.blocking.finalizing' }
    ],
    blockStartup: true,
    onFailure: SystemMigrationFailurePolicyEnum.stop,
    run: async () => undefined
  }
];

describe('system migration service', () => {
  const migrationIdPattern = /^20260903_service_/;

  beforeEach(async () => {
    await Promise.all([
      MongoSystemMigrationState.deleteMany({ _id: migrationIdPattern }),
      MongoSystemMigrationFailedRecord.deleteMany({ migrationId: migrationIdPattern })
    ]);
  });

  it('merges static ordered metadata with generic Mongo state', async () => {
    await MongoSystemMigrationState.collection.insertOne({
      _id: migrations[0].id,
      status: SystemMigrationStatusEnum.succeeded,
      result: { migratedCount: 3 },
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const result = await getSystemMigrationList(migrations);

    expect(result.businessReady).toBe(false);
    expect(result.migrations).toEqual([
      expect.objectContaining({
        id: migrations[0].id,
        order: 1,
        status: SystemMigrationStatusEnum.succeeded,
        failedRecordCount: 0,
        progress: [
          expect.objectContaining({ key: 'migrating', status: SystemMigrationStatusEnum.pending })
        ],
        onFailure: SystemMigrationFailurePolicyEnum.continue,
        result: {
          key: 'system_migration:migrations.first.result',
          params: { migratedCount: 3 }
        }
      }),
      expect.objectContaining({
        id: migrations[1].id,
        order: 2,
        status: SystemMigrationStatusEnum.pending,
        progress: [
          expect.objectContaining({ key: 'finalizing', status: SystemMigrationStatusEnum.pending })
        ],
        blockStartup: true,
        onFailure: SystemMigrationFailurePolicyEnum.stop
      })
    ]);
  });

  it('ignores Mongo states that are not present in the static registry', async () => {
    await MongoSystemMigrationState.insertMany([
      {
        _id: migrations[0].id,
        status: SystemMigrationStatusEnum.succeeded
      },
      {
        _id: '20260903_service_orphaned_old_task',
        status: SystemMigrationStatusEnum.succeeded
      }
    ]);

    const result = await getSystemMigrationList(migrations);

    expect(result.migrations.map((migration) => migration.id)).toEqual(
      migrations.map((migration) => migration.id)
    );
    expect(result.migrations).toHaveLength(migrations.length);
  });

  it('loads the latest failed records separately from the polling list', async () => {
    const failedRecords = [
      {
        stageKey: 'migrating',
        data: { recordId: 'bad-record' },
        reason: { message: 'bad source data' }
      }
    ];
    await MongoSystemMigrationState.create({
      _id: migrations[0].id,
      status: SystemMigrationStatusEnum.failed
    });
    await MongoSystemMigrationFailedRecord.insertMany(
      failedRecords.map((record) => ({
        migrationId: migrations[0].id,
        runId: 'failed-run',
        ...record
      }))
    );

    await expect(getSystemMigrationList(migrations)).resolves.toMatchObject({
      migrations: [
        {
          failedRecordCount: 1,
          progress: [expect.objectContaining({ key: 'migrating', failedRecordCount: 1 })]
        },
        expect.any(Object)
      ]
    });

    await expect(
      getSystemMigrationFailedRecords(migrations[0].id, 'migrating', migrations)
    ).resolves.toEqual({
      migrationId: migrations[0].id,
      stageKey: 'migrating',
      failedRecords
    });
    await expect(
      getSystemMigrationFailedRecords('unknown', 'migrating', migrations)
    ).rejects.toThrow('System migration not found');
    await expect(
      getSystemMigrationFailedRecords(migrations[0].id, 'unknown', migrations)
    ).rejects.toThrow('System migration stage not found');
  });

  it('treats missing and failed blocking states as not complete', async () => {
    expect(await areBlockingMigrationsComplete(migrations)).toBe(false);
    await MongoSystemMigrationState.create({
      _id: migrations[1].id,
      status: SystemMigrationStatusEnum.failed
    });
    expect(await areBlockingMigrationsComplete(migrations)).toBe(false);

    await MongoSystemMigrationState.updateOne(
      { _id: migrations[1].id },
      { $set: { status: SystemMigrationStatusEnum.succeeded } }
    );
    expect(await areBlockingMigrationsComplete(migrations)).toBe(true);
  });

  it('retries only failed non-blocking migrations', async () => {
    await MongoSystemMigrationState.create({
      _id: migrations[0].id,
      status: SystemMigrationStatusEnum.failed,
      runId: 'failed-run'
    });

    await expect(retryNonBlockingSystemMigration(migrations[0].id, migrations)).resolves.toBe(
      undefined
    );
    await expect(
      MongoSystemMigrationState.findById(migrations[0].id).lean()
    ).resolves.toMatchObject({
      status: SystemMigrationStatusEnum.pending
    });
    await expect(retryNonBlockingSystemMigration(migrations[0].id, migrations)).rejects.toThrow(
      'Only a failed system migration can be retried'
    );
    await expect(retryNonBlockingSystemMigration(migrations[1].id, migrations)).rejects.toThrow(
      'Blocking system migration must be recovered by restarting the App node'
    );
  });
});
