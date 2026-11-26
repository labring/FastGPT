import handler from '@/pages/api/core/dataset/training/getDatasetTrainingQueue';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetQaTraining } from '@test/datas/datasetQaTraining';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { expect, it } from 'vitest';

it.each([
  DatasetDataIndexStatusEnum.rebuildIndexFailed,
  DatasetDataIndexStatusEnum.rebuildSynonymFailed
])('reports %s in the training status', async (indexStatus) => {
  const { root, dataset, scope } = await createDatasetCollectionFixture();
  await MongoDatasetData.create({ ...scope, q: 'failed rebuild', indexStatus });

  expect(await Call(handler, { auth: root, query: { datasetId: dataset._id } })).toMatchObject({
    code: 200,
    data: { hasTrainingTask: true }
  });
});

it('returns only task existence, using data for rebuilds and excluding stale or out-of-scope records', async () => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    name: 'queue-counts',
    teamId: root.teamId,
    tmbId: root.tmbId
  });
  const scope = {
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: new Types.ObjectId()
  };
  await MongoDatasetData.create(
    [
      DatasetDataIndexStatusEnum.rebuildIndexPending,
      DatasetDataIndexStatusEnum.rebuildIndexRunning,
      DatasetDataIndexStatusEnum.rebuildIndexFailed,
      DatasetDataIndexStatusEnum.indexed
    ].map((indexStatus) => ({ ...scope, q: 'saved', indexStatus }))
  );
  await MongoDatasetData.create({
    ...scope,
    datasetId: new Types.ObjectId(),
    q: 'outside',
    indexStatus: DatasetDataIndexStatusEnum.rebuildIndexRunning
  });
  await MongoDatasetData.create({
    ...scope,
    teamId: new Types.ObjectId(),
    indexStatus: DatasetDataIndexStatusEnum.rebuildSynonymFailed
  });
  const qa = await MongoDatasetQaTraining.create({ ...scope, q: 'pending', status: 'active' });
  const res = await Call(handler, { auth: root, query: { datasetId: dataset._id } });
  expect(res.code).toBe(200);
  expect(res.data).toEqual({ hasTrainingTask: true });

  // 索引结束后 QA 仍算在途；两处都完成以后解除拦截。
  await MongoDatasetData.updateMany(
    { teamId: root.teamId, datasetId: dataset._id },
    { $set: { indexStatus: DatasetDataIndexStatusEnum.indexed } }
  );
  expect((await Call(handler, { auth: root, query: { datasetId: dataset._id } })).data).toEqual({
    hasTrainingTask: true
  });
  await qa.deleteOne();
  expect((await Call(handler, { auth: root, query: { datasetId: dataset._id } })).data).toEqual({
    hasTrainingTask: false
  });
});
