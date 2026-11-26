import handler from '@/pages/api/core/dataset/training/updateTrainingData';
import { reconcileDatasetTraining } from '@/service/core/dataset/training/documentWorker';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexStatusEnum
} from '@fastgpt/global/core/dataset/data/constants';
import {
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { getFakeUsers, getUser } from '@test/datas/users';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { Call } from '@test/utils/request';
import { Types } from '@fastgpt/service/common/mongo';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('@fastgpt/service/support/user/audit/util');

const activeRound = () => ({
  status: 'active' as const,
  usageId: String(new Types.ObjectId()),
  revision: 1
});

describe('updateTrainingData', () => {
  it.each([DatasetDataIndexStageEnum.index, DatasetDataIndexStageEnum.imageParse])(
    'edits a failed %s item and ignores a legacy request datasetId',
    async (indexStatus) => {
      const { root, collection, scope } = await createDatasetCollectionFixture();
      await collection.updateOne({ $set: { training: activeRound() } });
      const data = await MongoDatasetData.create({
        ...scope,
        q: 'original',
        indexStatus,
        indexError: true,
        indexErrorMsg: 'failed'
      });
      expect(
        await Call(handler, {
          auth: root,
          body: {
            dataId: data._id,
            datasetId: new Types.ObjectId(),
            q: 'edited',
            a: '',
            chunkIndex: 1
          }
        })
      ).toMatchObject({ code: 200 });
      const updated = await MongoDatasetData.findById(data._id).lean();
      expect(updated).toMatchObject({
        q: 'edited',
        a: '',
        chunkIndex: 1,
        indexStatus: DatasetDataIndexStageEnum.index
      });
      expect(updated).not.toHaveProperty('indexError');
      expect(updated).not.toHaveProperty('indexErrorMsg');
    }
  );

  it.each([
    DatasetDataIndexStageEnum.rebuildIndexRunning,
    DatasetDataIndexStageEnum.rebuildSynonymRunning
  ])('rejects text edits to %s and allows retry of the stored stage', async (indexStatus) => {
    const { root, collection, scope } = await createDatasetCollectionFixture();
    await collection.updateOne({ $set: { training: activeRound() } });
    const data = await MongoDatasetData.create({
      ...scope,
      q: 'original',
      indexStatus,
      indexError: true,
      indexErrorMsg: 'failed'
    });
    expect((await Call(handler, { auth: root, body: { dataId: data._id, a: '' } })).code).not.toBe(
      200
    );
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({ indexError: true });
    expect(await Call(handler, { auth: root, body: { dataId: data._id } })).toMatchObject({
      code: 200
    });
    const updated = await MongoDatasetData.findById(data._id).lean();
    expect(updated).toMatchObject({ indexStatus, q: 'original' });
    expect(updated).not.toHaveProperty('indexError');
  });

  it('retries historical rebuild failures from the corresponding pending stages', async () => {
    const { root, collection, scope } = await createDatasetCollectionFixture();
    await collection.updateOne({ $set: { training: activeRound() } });
    const [embedding, synonym] = await MongoDatasetData.create([
      { ...scope, indexStatus: DatasetDataIndexStatusEnum.rebuildIndexFailed },
      { ...scope, indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymFailed }
    ]);

    await reconcileDatasetTraining(scope.collectionId);
    expect(
      (await MongoDatasetCollection.findById(scope.collectionId).lean())?.training
    ).toMatchObject({
      status: 'active'
    });
    expect(
      await Call(handler, { auth: root, body: { collectionId: scope.collectionId } })
    ).toMatchObject({ code: 200 });
    expect(await MongoDatasetData.findById(embedding._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending
    });
    expect(await MongoDatasetData.findById(synonym._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStageEnum.rebuildSynonymPending
    });
  });

  it.each(['collection', 'dataset'] as const)(
    'retries failed items only within the %s scope',
    async (target) => {
      const current = await createDatasetCollectionFixture();
      await current.collection.updateOne({ $set: { training: activeRound() } });
      const other = await MongoDatasetCollection.create({
        ...current.scope,
        name: 'other',
        type: DatasetCollectionTypeEnum.file,
        training: activeRound()
      });
      const foreign = await createDatasetCollectionFixture();
      const failed = {
        q: 'failed',
        indexStatus: DatasetDataIndexStageEnum.index,
        indexError: true,
        indexErrorMsg: 'failed'
      };
      const [own, sibling, outside] = await MongoDatasetData.create([
        { ...current.scope, ...failed },
        { ...current.scope, collectionId: other._id, ...failed },
        { ...foreign.scope, ...failed }
      ]);
      const body =
        target === 'collection'
          ? { collectionId: current.scope.collectionId }
          : { datasetId: current.scope.datasetId };
      expect(await Call(handler, { auth: current.root, body })).toMatchObject({ code: 200 });
      expect(await MongoDatasetData.findById(own._id).lean()).not.toHaveProperty('indexError');
      expect((await MongoDatasetData.findById(sibling._id).lean())?.indexError).toBe(
        target === 'collection' ? true : undefined
      );
      expect(await MongoDatasetData.findById(outside._id).lean()).toMatchObject({
        indexError: true
      });
    }
  );

  it('writes a single-task audit on item retry and one audit per batch retry request', async () => {
    const { root, dataset, collection, scope } = await createDatasetCollectionFixture();

    // 批量重试只按请求参数记录日志，不再统计实际命中条数；空队列也一样留一条发起记录。
    expect((await Call(handler, { auth: root, body: { datasetId: dataset._id } })).code).toBe(200);
    await vi.waitFor(
      async () => {
        expect(
          await MongoTeamAudit.countDocuments({
            teamId: root.teamId,
            event: 'dataset.training.retry'
          })
        ).toBe(1);
      },
      { timeout: 5000 }
    );

    await collection.updateOne({ $set: { training: activeRound() } });
    const task = await MongoDatasetData.create({
      ...scope,
      indexStatus: DatasetDataIndexStageEnum.index,
      q: 'failed chunk',
      indexError: true,
      indexErrorMsg: 'failed'
    });
    const response = await Call(handler, { auth: root, body: { dataId: task._id } });
    expect(response.code).toBe(200);

    // 单条重试单独一条事件，且带上所属集合，便于定位到分块所在集合。
    await vi.waitFor(
      async () => {
        const logs = await MongoTeamAudit.find({
          teamId: root.teamId,
          event: 'dataset.training.task.retry'
        }).lean();
        expect(logs).toHaveLength(1);
        expect(logs[0].resources).toEqual([
          {
            type: 'collection',
            id: String(collection._id),
            name: collection.name,
            datasetId: dataset._id,
            collectionType: collection.type
          }
        ]);
        expect(logs[0].metadata).toEqual(
          expect.objectContaining({
            datasetName: dataset.name,
            collectionName: collection.name
          })
        );
      },
      { timeout: 5000 }
    );
  });

  it('does not let request datasetId bypass the item collection authorization', async () => {
    const current = await createDatasetCollectionFixture({ user: await getUser('normal-user') });
    const foreign = await createDatasetCollectionFixture({ user: await getUser('foreign-user') });
    const task = await MongoDatasetData.create({
      ...foreign.scope,
      indexStatus: DatasetDataIndexStageEnum.index,
      q: 'original',
      a: 'original'
    });
    const response = await Call(handler, {
      auth: current.root,
      body: {
        datasetId: current.dataset._id,
        dataId: task._id,
        q: 'changed',
        a: 'changed'
      }
    });
    expect(response.code).not.toBe(200);
    expect(await MongoDatasetData.findById(task._id).lean()).toMatchObject({
      q: 'original',
      a: 'original'
    });
  });

  it.each(['missing', 'team', 'dataset'] as const)(
    'rejects a %s task boundary without updating the task',
    async (boundary) => {
      const { root, scope } = await createDatasetCollectionFixture();
      const task = await MongoDatasetData.create({
        ...scope,
        indexStatus: DatasetDataIndexStageEnum.index,
        q: 'original'
      });
      if (boundary === 'missing') await MongoDatasetData.deleteOne({ _id: task._id });
      else
        await MongoDatasetData.updateOne(
          { _id: task._id },
          { $set: { [boundary === 'team' ? 'teamId' : 'datasetId']: new Types.ObjectId() } }
        );
      const response = await Call(handler, {
        auth: root,
        body: { dataId: task._id, q: 'changed' }
      });
      expect(response.code).not.toBe(200);
      if (boundary !== 'missing')
        expect((await MongoDatasetData.findById(task._id).lean())?.q).toBe('original');
    }
  );

  it('scopes dataset-level batch retry to collections with write permission', async () => {
    const {
      owner,
      members: [writer]
    } = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'Collection write permissions',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      vectorModel: 'test',
      agentModel: 'test',
      collectionPermissionEnabled: true
    });
    const datasetId = String(dataset._id);
    const scope = { teamId: owner.teamId, tmbId: owner.tmbId, datasetId };
    const [restricted, writable] = await MongoDatasetCollection.create(
      ['Restricted', 'Writable'].map((name) => ({
        ...scope,
        name,
        type: DatasetCollectionTypeEnum.file,
        inheritPermission: false,
        training: {
          status: 'active',
          usageId: String(new Types.ObjectId()),
          revision: 1
        }
      }))
    );
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: owner.teamId,
        resourceId: dataset._id,
        tmbId: writer.tmbId,
        permission: WritePermissionVal
      },
      {
        resourceType: PerResourceTypeEnum.collection,
        teamId: owner.teamId,
        resourceId: restricted._id,
        tmbId: writer.tmbId,
        permission: ReadPermissionVal
      },
      {
        resourceType: PerResourceTypeEnum.collection,
        teamId: owner.teamId,
        resourceId: writable._id,
        tmbId: writer.tmbId,
        permission: WritePermissionVal
      }
    ]);
    const [restrictedData, writableData] = await MongoDatasetData.create([
      {
        ...scope,
        collectionId: restricted._id,
        q: 'Restricted chunk',
        indexStatus: DatasetDataIndexStageEnum.index,
        indexError: true,
        indexErrorMsg: 'Restricted error'
      },
      {
        ...scope,
        collectionId: writable._id,
        q: 'Writable chunk',
        indexStatus: DatasetDataIndexStageEnum.index,
        indexError: true,
        indexErrorMsg: 'Writable error'
      }
    ]);

    const response = await Call(handler, {
      auth: writer,
      body: { datasetId }
    });
    expect(response.code).toBe(200);
    expect(await MongoDatasetData.findById(restrictedData._id).lean()).toMatchObject({
      indexError: true,
      indexErrorMsg: 'Restricted error'
    });
    expect((await MongoDatasetData.findById(writableData._id).lean())?.indexError).toBeUndefined();
  });
});
