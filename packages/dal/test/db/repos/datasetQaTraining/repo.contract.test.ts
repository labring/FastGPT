import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import { injectRepo } from '@fastgpt/dal/db/container';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import { closeDbRuntime, configureDbRuntime } from '@fastgpt/dal/db/runtime';
import {
  createContractBackends,
  createMockOceanBaseKysely,
  type ContractBackendContext
} from '@fastgpt/dal/db/testing';
import { runInTransaction } from '@fastgpt/dal/db/transaction';
import { DatasetQaTrainingRepoToken } from '@fastgpt/dal/db/repos/datasetQaTraining/repo';
import { datasetQaTrainingMongoCollection } from '../../../../db/repos/datasetQaTraining/mongo/schema';

describe('DatasetQaTrainingRepository Phase 1A OceanBase fail-closed guardrail', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('throws DbConfigurationError when pure OceanBase runtime has no fallbackMongo', async () => {
    const { db } = createMockOceanBaseKysely(() => ({ rows: [] }));
    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      oceanBaseExecutorResolver: () => db
    });

    const repo = injectRepo(DatasetQaTrainingRepoToken);
    expect(() => repo.exists({ id: createEntityId() })).toThrow(DbConfigurationError);
  });

  it('declares document-stage index with chunk ordering and no TTL expiry', () => {
    expect(datasetQaTrainingMongoCollection.indexes).toEqual([
      {
        key: { teamId: 1, datasetId: 1, collectionId: 1, status: 1, chunkIndex: 1, _id: 1 },
        options: { name: 'fg_dataset_qa_training_scope_stage_order' }
      }
    ]);
  });
});

const backends = createContractBackends({
  mongoCollections: [datasetQaTrainingMongoCollection]
});

describe.each(backends)('DatasetQaTrainingRepository contract ($name)', (backend) => {
  let ctx!: ContractBackendContext;

  beforeAll(async () => {
    ctx = await backend.setup();
  }, 60_000);

  afterAll(async () => {
    await backend.teardown();
  });

  beforeEach(async () => {
    await ctx.clearAll();
  });

  it('supports createMany, ordered list, markFailed, retryMany, countByCollections, and delete operations', async () => {
    const repo = injectRepo(DatasetQaTrainingRepoToken);
    const teamId = createEntityId();
    const tmbId = createEntityId();
    const datasetId = createEntityId();
    const colA = createEntityId();
    const colB = createEntityId();

    const created = await repo.createMany({
      items: [
        { teamId, tmbId, datasetId, collectionId: colA, q: 'second', chunkIndex: 2 },
        { teamId, tmbId, datasetId, collectionId: colA, q: 'first', chunkIndex: 1 },
        {
          teamId,
          tmbId,
          datasetId,
          collectionId: colB,
          q: 'other',
          chunkIndex: 0,
          status: 'error',
          errorMsg: 'boom'
        }
      ]
    });
    expect(created).toHaveLength(3);

    const ordered = await repo.list({
      teamId,
      datasetId,
      collectionId: colA,
      status: 'active',
      sort: 'chunkOrder'
    });
    expect(ordered.map((item) => item.q)).toEqual(['first', 'second']);

    const marked = await repo.markFailed({
      teamId,
      datasetId,
      collectionId: colA,
      id: ordered[0]._id,
      errorMsg: 'llm error'
    });
    expect(marked).toBe(true);

    const counts = await repo.countByCollections({
      teamId,
      datasetId,
      collectionIds: [colA, colB]
    });
    expect(counts).toEqual(
      expect.arrayContaining([
        { _id: colA, activeCount: 1, finalErrorCount: 1 },
        { _id: colB, activeCount: 0, finalErrorCount: 1 }
      ])
    );

    const editable = await repo.findOneEditable({
      teamId,
      datasetId,
      collectionId: colA,
      taskId: ordered[0]._id
    });
    expect(editable?.errorMsg).toBe('llm error');

    const retried = await repo.retryMany({
      teamId,
      datasetId,
      collectionId: colA,
      taskId: ordered[0]._id,
      edit: { q: 'updated first', chunkIndex: 3 }
    });
    expect(retried).toBe(1);

    const reloaded = await repo.findById({
      id: ordered[0]._id,
      scope: { teamId, datasetId, collectionId: colA }
    });
    expect(reloaded).toMatchObject({
      q: 'updated first',
      chunkIndex: 3,
      status: 'active'
    });
    expect(reloaded?.errorMsg).toBeUndefined();

    expect(
      await repo.deleteOne({ id: ordered[0]._id, teamId, datasetId, collectionId: colA })
    ).toBe(1);
    expect(await repo.exists({ id: ordered[0]._id })).toBe(false);
    expect(await repo.deleteMany({ datasetIds: [] })).toBe(0);
    expect(await repo.deleteMany({ teamId: 'invalid-id' })).toBe(0);
    expect(await repo.deleteMany({} as never)).toBe(0);
    expect(await repo.count({ teamId, datasetId })).toBe(2);
    expect(await repo.deleteMany({ teamId, datasetId })).toBe(2);
    expect(await repo.count({ teamId, datasetId })).toBe(0);
  });

  it('commits and rolls back atomically inside runInTransaction', async () => {
    const repo = injectRepo(DatasetQaTrainingRepoToken);
    const teamId = createEntityId();
    const tmbId = createEntityId();
    const datasetId = createEntityId();
    const collectionId = createEntityId();

    await expect(
      runInTransaction(async (tx) => {
        await repo.createMany({
          items: [{ teamId, tmbId, datasetId, collectionId, q: 'rollback-me' }],
          tx
        });
        expect(await repo.exists({ teamId, datasetId, collectionId, tx })).toBe(true);
        throw new Error('force rollback');
      })
    ).rejects.toThrow('force rollback');

    expect(await repo.exists({ teamId, datasetId, collectionId })).toBe(false);

    await runInTransaction(async (tx) => {
      await repo.createMany({
        items: [{ teamId, tmbId, datasetId, collectionId, q: 'commit-me' }],
        tx
      });
    });
    expect(await repo.count({ teamId, datasetId, collectionId })).toBe(1);
  });
});
