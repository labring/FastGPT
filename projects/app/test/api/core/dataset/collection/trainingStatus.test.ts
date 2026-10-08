import listHandler from '@/pages/api/core/dataset/collection/listV2';
import detailHandler from '@/pages/api/core/dataset/collection/detail';
import trainingDetailHandler from '@/pages/api/core/dataset/collection/trainingDetail';
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
import { enqueueNextDatasetRebuildTask } from '@/service/core/dataset/queues/rebuild';
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
  it('includes waiting rebuild data without counting enqueued rebuilds twice', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'rebuild-counts',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });
    const collection = await MongoDatasetCollection.create({
      name: 'rebuild-counts',
      type: DatasetCollectionTypeEnum.file,
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id
    });
    const scope = {
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id
    };
    const datas = await MongoDatasetData.create(
      [
        DatasetDataIndexStatusEnum.waitingRebuild,
        DatasetDataIndexStatusEnum.waitingRebuild,
        DatasetDataIndexStatusEnum.waitingRebuild,
        DatasetDataIndexStatusEnum.rebuilding,
        DatasetDataIndexStatusEnum.rebuilding,
        DatasetDataIndexStatusEnum.rebuildError,
        DatasetDataIndexStatusEnum.indexing,
        DatasetDataIndexStatusEnum.indexed
      ].map((indexStatus, chunkIndex) => ({
        ...scope,
        q: 'saved content',
        indexes: [],
        chunkIndex,
        indexStatus
      }))
    );
    await MongoDatasetData.create({
      ...scope,
      collectionId: new Types.ObjectId(),
      q: 'outside this collection',
      indexes: [],
      indexStatus: DatasetDataIndexStatusEnum.waitingRebuild
    });
    await MongoDatasetTraining.create([
      {
        ...scope,
        billId: 'test',
        mode: TrainingModeEnum.rebuild,
        dataId: datas[3]._id,
        retryCount: 3,
        lockTime: new Date('2000')
      },
      {
        ...scope,
        billId: 'test',
        mode: TrainingModeEnum.rebuild,
        dataId: datas[4]._id,
        retryCount: 3,
        lockTime: new Date()
      },
      {
        ...scope,
        billId: 'test',
        mode: TrainingModeEnum.rebuild,
        dataId: datas[5]._id,
        retryCount: 0,
        lockTime: new Date('2000'),
        errorMsg: 'rebuild failed'
      }
    ]);
    const readCounts = () =>
      Call(trainingDetailHandler, {
        auth: root,
        query: { collectionId: collection._id }
      });
    const before = await readCounts();
    expect(before.code).toBe(200);
    expect(before.data).toMatchObject({
      queuedCounts: { rebuild: 4, index: 0 },
      trainingCounts: { rebuild: 1, index: 0 },
      errorCounts: { rebuild: 1, index: 0 },
      trainedCount: 1
    });

    // waitingRebuild 入队后由 data 计数切换到 training 计数，等待总量保持不变。
    await enqueueNextDatasetRebuildTask({
      teamId: String(root.teamId),
      tmbId: String(root.tmbId),
      datasetId: String(dataset._id),
      billId: 'test'
    });
    const after = await readCounts();
    expect(after.code).toBe(200);
    expect(after.data.queuedCounts.rebuild).toBe(4);
    expect(after.data.trainingCounts.rebuild).toBe(1);
    expect(after.data.errorCounts.rebuild).toBe(1);
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
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });
    const collection = await MongoDatasetCollection.create({
      name: 'test',
      type: DatasetCollectionTypeEnum.file,
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id
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
        mode: TrainingModeEnum.rebuild,
        retryCount: 0,
        errorMsg: 'final error'
      }
    ]);

    const listRes = await Call(listHandler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        pageSize: 10,
        offset: 0
      }
    });

    expect(listRes.code).toBe(200);
    expect(listRes.data.list[0]).toMatchObject({
      trainingAmount: 2,
      activeTrainingAmount: 1,
      finalErrorAmount: 1,
      hasError: true,
      slowestTrainingMode: TrainingModeEnum.parse,
      slowestTrainingStatus: CollectionTrainingStatusEnum.running
    });

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
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });
    const collection = await MongoDatasetCollection.create({
      name: 'test',
      type: DatasetCollectionTypeEnum.file,
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id
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
        mode: TrainingModeEnum.rebuild,
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
    expect(res.data.errorCounts.rebuild).toBe(1);
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
        mode: TrainingModeEnum.rebuild,
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
    expect(res.data.queuedCounts.rebuild).toBe(0);
  });
});
