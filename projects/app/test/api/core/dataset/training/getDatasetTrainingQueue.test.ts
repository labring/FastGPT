import handler from '@/pages/api/core/dataset/training/getDatasetTrainingQueue';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { expect, it } from 'vitest';

it('counts rebuild data separately from ordinary training without duplicates or cross-dataset data', async () => {
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
  const datas = await MongoDatasetData.create(
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
  await MongoDatasetTraining.create([
    { ...scope, billId: 'test', dataId: datas[1]._id, mode: TrainingModeEnum.rebuild },
    {
      ...scope,
      billId: 'test',
      dataId: datas[2]._id,
      mode: TrainingModeEnum.rebuild,
      retryCount: 0,
      errorMsg: 'failed'
    },
    { ...scope, billId: 'test', mode: TrainingModeEnum.qa }
  ]);
  const res = await Call(handler, { auth: root, query: { datasetId: dataset._id } });
  expect(res.code).toBe(200);
  expect(res.data).toEqual({ rebuildingCount: 3, trainingCount: 1 });
});
