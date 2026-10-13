import listHandler from '@/pages/api/core/dataset/collection/listV2';
import detailHandler from '@/pages/api/core/dataset/collection/detail';
import trainingDetailHandler from '@/pages/api/core/dataset/collection/trainingDetail';
import type { ListCollectionV2ResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { enqueueNextDatasetSynonymRebuildTask } from '@/service/core/dataset/queues/rebuildSynonym';
import queueHandler from '@/pages/api/core/dataset/training/getDatasetTrainingQueue';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { enqueueNextDatasetRebuildTask } from '@/service/core/dataset/queues/rebuild';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { getFakeUsers, getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

describe('collection training status api', () => {
  const rebuildModes = [
    {
      mode: TrainingModeEnum.rebuildIndex,
      pending: DatasetDataIndexStatusEnum.rebuildIndexPending,
      running: DatasetDataIndexStatusEnum.rebuildIndexRunning,
      failed: DatasetDataIndexStatusEnum.rebuildIndexFailed,
      enqueue: enqueueNextDatasetRebuildTask
    },
    {
      mode: TrainingModeEnum.rebuildSynonym,
      pending: DatasetDataIndexStatusEnum.rebuildSynonymPending,
      running: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
      failed: DatasetDataIndexStatusEnum.rebuildSynonymFailed,
      enqueue: enqueueNextDatasetSynonymRebuildTask
    }
  ];

  /** 对照列表、详情、状态弹窗与队列入口，验证重建计数只取 data，不随 training 重复计数。 */
  const readStatus = async ({
    root,
    dataset,
    collection
  }: Awaited<ReturnType<typeof createDatasetCollectionFixture>>) => {
    const [list, detail, modal, queue] = await Promise.all([
      Call(listHandler, { auth: root, body: { datasetId: dataset._id, pageNum: 1, pageSize: 10 } }),
      Call(detailHandler, { auth: root, query: { id: collection._id } }),
      Call(trainingDetailHandler, { auth: root, query: { collectionId: collection._id } }),
      Call(queueHandler, { auth: root, query: { datasetId: dataset._id } })
    ]);
    for (const response of [list, detail, modal, queue]) expect(response.code).toBe(200);
    return { list: list.data.list[0], detail: detail.data, modal: modal.data, queue: queue.data };
  };

  it.each(rebuildModes)(
    'counts $mode once before and after queue admission',
    async ({ mode, pending, running, failed, enqueue }) => {
      const otherMode =
        mode === TrainingModeEnum.rebuildIndex
          ? TrainingModeEnum.rebuildSynonym
          : TrainingModeEnum.rebuildIndex;
      const context = await createDatasetCollectionFixture();
      const { root, dataset, scope } = context;
      Object.assign(serviceEnv, { DATASET_SYNONYM_ENABLED: true });
      if (mode === TrainingModeEnum.rebuildSynonym) {
        await MongoDatasetSynonym.create({
          teamId: root.teamId,
          datasetId: dataset._id,
          version: 2,
          enabled: true
        });
      }
      const datas = await MongoDatasetData.create(
        [
          pending,
          pending,
          pending,
          running,
          running,
          failed,
          DatasetDataIndexStatusEnum.indexing,
          DatasetDataIndexStatusEnum.indexed,
          undefined
        ].map((indexStatus, chunkIndex) => ({
          ...scope,
          q: 'saved content',
          indexes: [],
          chunkIndex,
          indexStatus,
          synonymVersion: 2
        }))
      );
      await MongoDatasetData.create({
        ...scope,
        collectionId: new Types.ObjectId(),
        q: 'outside',
        indexStatus: pending
      });
      await MongoDatasetTraining.create([
        { ...scope, billId: 'test', mode, dataId: datas[3]._id, lockTime: new Date(0) },
        { ...scope, billId: 'test', mode, dataId: datas[4]._id, lockTime: new Date() },
        { ...scope, billId: 'test', mode, dataId: datas[5]._id, retryCount: 0, errorMsg: 'failed' },
        { ...scope, billId: 'test', mode, dataId: datas[7]._id, retryCount: 0, errorMsg: 'stale' }
      ]);
      const check = async (queued: number, processing: number) => {
        const status = await readStatus(context);
        for (const result of [status.list, status.detail]) {
          expect(result).toMatchObject({
            trainingAmount: 6,
            activeTrainingAmount: 5,
            finalErrorAmount: 1,
            hasError: true,
            slowestTrainingMode: mode,
            slowestTrainingStatus: CollectionTrainingStatusEnum.running
          });
        }
        expect(status.modal).toMatchObject({
          queuedCounts: { [mode]: queued, [otherMode]: 0, index: 0 },
          trainingCounts: { [mode]: processing, [otherMode]: 0, index: 0 },
          errorCounts: { [mode]: 1, [otherMode]: 0, index: 0 },
          trainedCount: 2
        });
        expect(status.queue).toEqual({ hasTrainingTask: true });
      };
      await check(3, 2);
      await enqueue({ ...scope, datasetId: String(dataset._id), billId: 'test' });
      await check(2, 3);
    }
  );

  it.each(rebuildModes)(
    'uses $mode data for orphan failures and ignores stale tasks',
    async ({ mode, pending, running, failed }) => {
      const otherMode =
        mode === TrainingModeEnum.rebuildIndex
          ? TrainingModeEnum.rebuildSynonym
          : TrainingModeEnum.rebuildIndex;
      const context = await createDatasetCollectionFixture();
      const { dataset, scope } = context;
      const datas = await MongoDatasetData.create(
        [pending, running, failed, DatasetDataIndexStatusEnum.indexed, undefined].map(
          (indexStatus) => ({ ...scope, q: 'saved content', indexes: [], indexStatus })
        )
      );
      await MongoDatasetData.create({
        ...scope,
        collectionId: new Types.ObjectId(),
        q: 'outside',
        indexStatus: failed
      });
      await MongoDatasetTraining.create({
        ...scope,
        billId: 'test',
        mode,
        dataId: datas[3]._id,
        retryCount: 0,
        errorMsg: 'stale'
      });
      const check = async (failedCount: number, ready: number) => {
        const status = await readStatus(context);
        for (const result of [status.list, status.detail]) {
          expect(result).toMatchObject({
            trainingAmount: 2 + failedCount,
            activeTrainingAmount: 2,
            finalErrorAmount: failedCount,
            hasError: failedCount > 0,
            slowestTrainingMode: mode,
            slowestTrainingStatus: CollectionTrainingStatusEnum.running
          });
        }
        expect(status.modal).toMatchObject({
          queuedCounts: { [mode]: 1, [otherMode]: 0 },
          trainingCounts: { [mode]: 1, [otherMode]: 0 },
          errorCounts: { [mode]: failedCount, [otherMode]: 0 },
          trainedCount: ready
        });
      };
      await check(1, 2);
      await MongoDatasetTraining.updateMany(
        { datasetId: dataset._id },
        { $set: { retryCount: 3, lockTime: new Date() } }
      );
      await check(1, 2);
      await MongoDatasetData.updateOne(
        { _id: datas[2]._id },
        { $set: { indexStatus: DatasetDataIndexStatusEnum.indexed } }
      );
      await check(0, 3);
    }
  );

  it('shows pending rebuild status without any training task', async () => {
    const context = await createDatasetCollectionFixture();
    await MongoDatasetData.create({
      ...context.scope,
      q: 'pending',
      indexStatus: DatasetDataIndexStatusEnum.rebuildIndexPending
    });
    const status = await readStatus(context);
    for (const result of [status.list, status.detail]) {
      expect(result).toMatchObject({
        trainingAmount: 1,
        activeTrainingAmount: 1,
        finalErrorAmount: 0,
        slowestTrainingMode: TrainingModeEnum.rebuildIndex,
        slowestTrainingStatus: CollectionTrainingStatusEnum.running
      });
    }
  });
  it('returns each collection effective permission instead of the dataset permission', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const dataset = await MongoDataset.create({
      name: 'permission-test',
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      vectorModel: 'test',
      agentModel: 'test',
      collectionPermissionEnabled: true
    });
    const collection = await MongoDatasetCollection.create({
      name: 'writable-collection',
      type: DatasetCollectionTypeEnum.file,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId,
      datasetId: dataset._id
    });
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: users.owner.teamId,
        resourceId: String(dataset._id),
        tmbId: member.tmbId,
        permission: ReadRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.collection,
        teamId: users.owner.teamId,
        resourceId: String(collection._id),
        tmbId: member.tmbId,
        permission: WriteRoleVal
      }
    ]);

    const response = await Call(listHandler, {
      auth: member,
      body: {
        datasetId: dataset._id,
        pageSize: 10,
        offset: 0,
        filterTags: []
      }
    });

    expect(response.code).toBe(200);
    expect(response.data.list).toHaveLength(1);
    expect(response.data.list[0].permission).toMatchObject({
      role: WriteRoleVal,
      hasReadPer: true,
      hasWritePer: true,
      hasManagePer: false
    });

    const simpleResponse = await Call(listHandler, {
      auth: member,
      body: {
        datasetId: dataset._id,
        pageSize: 10,
        offset: 0,
        filterTags: [],
        simple: true
      }
    });
    expect(simpleResponse.code).toBe(200);
    expect(simpleResponse.data.list[0].permission).toMatchObject({
      role: WriteRoleVal,
      hasReadPer: true,
      hasWritePer: true,
      hasManagePer: false
    });
  });

  it('should expose unified active/final error/slowest status in list and detail', async () => {
    const { root, dataset, collection } = await createDatasetCollectionFixture();
    const [emptyCollection, readyCollection] = await MongoDatasetCollection.create(
      ['empty', 'ready'].map((name) => ({
        name,
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id
      }))
    );
    await MongoDatasetData.create(
      ['ready-1', 'ready-2'].map((q) => ({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: readyCollection._id,
        q,
        indexStatus: DatasetDataIndexStatusEnum.indexed
      }))
    );

    const rebuildData = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'saved content',
      indexes: [],
      indexStatus: DatasetDataIndexStatusEnum.rebuildIndexFailed
    });

    await MongoDatasetTraining.create([
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.parse,
        retryCount: 3
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.rebuildIndex,
        dataId: rebuildData._id,
        retryCount: 0,
        errorMsg: 'final error'
      }
    ]);

    const listRes = await Call<unknown, unknown, ListCollectionV2ResponseType>(listHandler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        pageSize: 10,
        offset: 0
      }
    });

    expect(listRes.code).toBe(200);
    expect(listRes.data.list).toHaveLength(3);
    expect(
      listRes.data.list.find((item) => String(item._id) === String(collection._id))
    ).toMatchObject({
      dataAmount: 1,
      trainingAmount: 2,
      activeTrainingAmount: 1,
      finalErrorAmount: 1,
      hasError: true,
      slowestTrainingMode: TrainingModeEnum.parse,
      slowestTrainingStatus: CollectionTrainingStatusEnum.running
    });
    for (const [target, dataAmount] of [
      [emptyCollection, 0],
      [readyCollection, 2]
    ] as const) {
      expect(
        listRes.data.list.find((item) => String(item._id) === String(target._id))
      ).toMatchObject({
        dataAmount,
        trainingAmount: 0,
        activeTrainingAmount: 0,
        finalErrorAmount: 0,
        hasError: false,
        slowestTrainingStatus: CollectionTrainingStatusEnum.ready
      });
    }

    const detailRes = await Call(detailHandler, {
      auth: root,
      query: {
        id: collection._id
      }
    });

    expect(detailRes.code).toBe(200);
    expect(detailRes.data).toMatchObject({
      trainingAmount: 2,
      activeTrainingAmount: 1,
      finalErrorAmount: 1,
      errorCount: 1,
      hasError: true,
      slowestTrainingMode: TrainingModeEnum.parse,
      slowestTrainingStatus: CollectionTrainingStatusEnum.running
    });
  });

  it('should split current collection queued/running counts and final errors', async () => {
    const { root, dataset, collection } = await createDatasetCollectionFixture();

    const rebuildData = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'saved content',
      indexes: [],
      indexStatus: DatasetDataIndexStatusEnum.rebuildIndexFailed
    });

    await MongoDatasetTraining.create([
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.qa,
        retryCount: 3,
        lockTime: new Date(),
        errorMsg: 'temporary failed'
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.parse,
        retryCount: 3,
        lockTime: new Date('2000')
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.rebuildIndex,
        dataId: rebuildData._id,
        retryCount: 0,
        errorMsg: 'final failed'
      }
    ]);

    const res = await Call(trainingDetailHandler, {
      auth: root,
      query: {
        collectionId: collection._id
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.queuedCounts.parse).toBe(1);
    expect(res.data.trainingCounts.parse).toBe(0);
    expect(res.data.queuedCounts.qa).toBe(0);
    expect(res.data.trainingCounts.qa).toBe(1);
    expect(res.data.errorCounts.qa).toBe(0);
    expect(res.data.errorCounts.rebuildIndex).toBe(1);
  });

  it('should not include other dataset training records in collection queued counts', async () => {
    const root = await getRootUser();
    const [dataset, otherDataset] = await MongoDataset.create([
      {
        name: 'current',
        teamId: root.teamId,
        tmbId: root.tmbId,
        vectorModel: 'test',
        agentModel: 'test'
      },
      {
        name: 'other',
        teamId: root.teamId,
        tmbId: root.tmbId,
        vectorModel: 'test',
        agentModel: 'test'
      }
    ]);
    const [collection, otherCollection] = await MongoDatasetCollection.create([
      {
        name: 'current',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id
      },
      {
        name: 'other',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: otherDataset._id
      }
    ]);

    await MongoDatasetTraining.create([
      ...Array.from({ length: 6 }).map(() => ({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: otherDataset._id,
        collectionId: otherCollection._id,
        billId: 'test',
        mode: TrainingModeEnum.rebuildIndex,
        retryCount: 3,
        lockTime: new Date('2000')
      })),
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.parse,
        retryCount: 3,
        lockTime: new Date('2000')
      }
    ]);

    const res = await Call(trainingDetailHandler, {
      auth: root,
      query: {
        collectionId: collection._id
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.queuedCounts.parse).toBe(1);
    expect(res.data.queuedCounts.rebuildIndex).toBe(0);
  });
});
