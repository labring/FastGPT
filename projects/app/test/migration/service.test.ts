import { describe, expect, it } from 'vitest';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigration } from '@/migration/registry';
import {
  getSystemMigrationFailedRecords,
  getSystemMigrationList,
  retrySystemMigration,
  startManualSystemMigration
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
    run: async () => undefined
  },
  {
    id: '20260903_service_independent',
    version: '4.17.0',
    nameKey: 'system_migration:migrations.independent.name',
    descriptionKey: 'system_migration:migrations.independent.description',
    resultKey: 'system_migration:migrations.independent.result',
    progressSteps: [
      { key: 'finalizing', labelKey: 'system_migration:migrations.independent.finalizing' }
    ],
    independent: true,
    run: async () => undefined
  }
];

describe('system migration service', () => {
  it('reports promoted prerequisites as startup work and refuses online retry for the whole chain', async () => {
    const prerequisite = migrations[1];
    const blocker = {
      ...migrations[0],
      id: '20261026_service_blocker',
      blockStartup: true,
      dependsOn: [prerequisite.id]
    };
    const registry = [migrations[0], prerequisite, blocker];
    const list = await getSystemMigrationList(registry);
    expect(
      list.migrations.map(({ blockStartup, independent }) => ({ blockStartup, independent }))
    ).toEqual([
      { blockStartup: false, independent: false },
      { blockStartup: true, independent: false },
      { blockStartup: true, independent: false }
    ]);
    for (const migration of [prerequisite, blocker]) {
      await MongoSystemMigrationState.updateOne(
        { _id: migration.id },
        { $set: { status: SystemMigrationStatusEnum.failed } }
      );
      await expect(retrySystemMigration(migration.id, registry)).rejects.toThrow(
        'restarting the lease-owning App node'
      );
      expect((await MongoSystemMigrationState.findById(migration.id))?.status).toBe(
        SystemMigrationStatusEnum.failed
      );
    }
  });

  it('merges static ordered metadata with generic Mongo state', async () => {
    await MongoSystemMigrationState.create({
      _id: migrations[0].id,
      status: SystemMigrationStatusEnum.succeeded,
      result: { migratedCount: 3 },
      progress: [
        {
          key: 'migrating',
          status: SystemMigrationStatusEnum.succeeded,
          current: 3,
          total: 3,
          updatedAt: new Date()
        }
      ],
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const result = await getSystemMigrationList(migrations);

    expect(result).not.toHaveProperty('businessReady');
    expect(result.migrations[0].independent).toBe(false);
    expect(result.migrations[0]).not.toHaveProperty('onFailure');
    expect(result.migrations).toEqual([
      expect.objectContaining({
        id: migrations[0].id,
        order: 1,
        status: SystemMigrationStatusEnum.succeeded,
        failedRecordCount: 0,
        progress: [
          expect.objectContaining({
            key: 'migrating',
            status: SystemMigrationStatusEnum.succeeded,
            current: 3,
            total: 3
          })
        ],
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
        independent: true
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

  it.each(migrations)('retries a failed task in either scheduling mode: $id', async (migration) => {
    await MongoSystemMigrationState.create({
      _id: migration.id,
      status: SystemMigrationStatusEnum.failed,
      runId: 'failed-run',
      checkpoint: { cursor: 12 }
    });

    await expect(retrySystemMigration(migration.id, migrations)).resolves.toBeUndefined();
    expect(await MongoSystemMigrationState.findById(migration.id).lean()).toMatchObject({
      status: SystemMigrationStatusEnum.pending,
      checkpoint: { cursor: 12 }
    });
    await expect(retrySystemMigration(migration.id, migrations)).rejects.toThrow(
      'Only a failed system migration can be retried'
    );
    await expect(retrySystemMigration('unknown', migrations)).rejects.toThrow('not found');
  });
});

describe('startManualSystemMigration', () => {
  const manual = { ...migrations[0], id: '20261008_service_manual', manual: true };

  it('reports an undeclared prerequisite as a registry error without enqueueing', async () => {
    const dependent = { ...manual, dependsOn: ['20261008_missing'] };
    await expect(startManualSystemMigration(dependent.id, [dependent])).rejects.toThrow(
      'System migration dependency not registered: 20261008_missing'
    );
    expect(await MongoSystemMigrationState.findById(dependent.id)).toBeNull();
  });

  it('requires a successful prerequisite before starting or retrying a dependent migration', async () => {
    const prerequisite = { ...manual, id: '20261008_service_prerequisite' };
    const dependent = {
      ...manual,
      id: '20261009_service_dependent',
      dependsOn: [prerequisite.id]
    };
    const registry = [prerequisite, dependent];
    await expect(startManualSystemMigration(dependent.id, registry)).rejects.toMatchObject({
      name: 'UserError',
      message: 'system_migration:prerequisite_not_succeeded',
      prerequisiteNameKey: prerequisite.nameKey
    });
    await getSystemMigrationList(registry);
    for (const status of [
      SystemMigrationStatusEnum.waiting,
      SystemMigrationStatusEnum.pending,
      SystemMigrationStatusEnum.running,
      SystemMigrationStatusEnum.failed
    ]) {
      await MongoSystemMigrationState.updateOne({ _id: prerequisite.id }, { $set: { status } });
      await expect(startManualSystemMigration(dependent.id, registry)).rejects.toMatchObject({
        prerequisiteNameKey: prerequisite.nameKey
      });
      expect((await MongoSystemMigrationState.findById(dependent.id))?.status).toBe(
        SystemMigrationStatusEnum.waiting
      );
    }
    await MongoSystemMigrationState.updateOne(
      { _id: dependent.id },
      { $set: { status: SystemMigrationStatusEnum.failed } }
    );
    await expect(retrySystemMigration(dependent.id, registry)).rejects.toMatchObject({
      name: 'UserError',
      message: 'system_migration:prerequisite_not_succeeded',
      prerequisiteNameKey: prerequisite.nameKey
    });
    await MongoSystemMigrationState.updateOne(
      { _id: prerequisite.id },
      { $set: { status: SystemMigrationStatusEnum.succeeded } }
    );
    await retrySystemMigration(dependent.id, registry);
    expect((await MongoSystemMigrationState.findById(dependent.id))?.status).toBe(
      SystemMigrationStatusEnum.pending
    );
    await MongoSystemMigrationState.updateOne(
      { _id: dependent.id },
      { $set: { status: SystemMigrationStatusEnum.waiting } }
    );
    await startManualSystemMigration(dependent.id, registry);
    expect((await MongoSystemMigrationState.findById(dependent.id))?.status).toBe(
      SystemMigrationStatusEnum.pending
    );
  });

  it('lists a waiting task, then accepts exactly one concurrent start', async () => {
    const list = await getSystemMigrationList([manual]);
    expect(list.migrations[0].status).toBe(SystemMigrationStatusEnum.waiting);
    const outcomes = await Promise.allSettled([
      startManualSystemMigration(manual.id, [manual]),
      startManualSystemMigration(manual.id, [manual])
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await getSystemMigrationList([manual])).migrations[0].status).toBe(
      SystemMigrationStatusEnum.pending
    );
  });

  it('can initialize without a list request and rejects automatic or unknown tasks', async () => {
    await expect(startManualSystemMigration('missing', [manual])).rejects.toThrow('not found');
    await expect(startManualSystemMigration(migrations[0].id, migrations)).rejects.toThrow(
      'Only a manual'
    );
    await startManualSystemMigration(manual.id, [manual]);
    await MongoSystemMigrationState.updateOne(
      { _id: manual.id },
      { $set: { status: SystemMigrationStatusEnum.failed, checkpoint: { cursor: 12 } } }
    );
    await expect(startManualSystemMigration(manual.id, [manual])).rejects.toThrow('Only a waiting');
    await retrySystemMigration(manual.id, [manual]);
    expect(await MongoSystemMigrationState.findById(manual.id).lean()).toMatchObject({
      status: 'pending',
      checkpoint: { cursor: 12 }
    });
  });
});
