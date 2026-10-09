import { describe, expect, it } from 'vitest';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import listHandler from '@/pages/api/core/dataset/collection/listV2';
import detailHandler from '@/pages/api/core/dataset/collection/detail';
import trainingHandler from '@/pages/api/core/dataset/collection/trainingDetail';
import queueHandler from '@/pages/api/core/dataset/training/getDatasetTrainingQueue';

describe('synonym rebuild data status counts', () => {
  it('counts the full pending/running/failed round once across all status APIs', async () => {
    const root = await getRootUser();
    const owner = { teamId: root.teamId, tmbId: root.tmbId };
    const dataset = await MongoDataset.create({
      ...owner,
      name: 'synonym counts',
      vectorModel: 'test',
      agentModel: 'test'
    });
    const collection = await MongoDatasetCollection.create({
      ...owner,
      datasetId: dataset._id,
      name: 'counts',
      type: DatasetCollectionTypeEnum.file
    });
    const scope = { ...owner, datasetId: dataset._id, collectionId: collection._id };
    const datas = await MongoDatasetData.create(
      [
        DatasetDataIndexStatusEnum.rebuildSynonymPending,
        DatasetDataIndexStatusEnum.rebuildSynonymPending,
        DatasetDataIndexStatusEnum.rebuildSynonymRunning,
        DatasetDataIndexStatusEnum.rebuildSynonymFailed,
        DatasetDataIndexStatusEnum.indexed
      ].map((indexStatus) => ({ ...scope, q: 'original', indexes: [], indexStatus }))
    );
    await MongoDatasetTraining.create([
      { ...scope, billId: 'test', mode: TrainingModeEnum.rebuildSynonym, dataId: datas[2]._id },
      // 已就绪数据的残留失败任务不能重复计入重建失败数量。
      {
        ...scope,
        billId: 'test',
        mode: TrainingModeEnum.rebuildSynonym,
        dataId: datas[4]._id,
        retryCount: 0,
        errorMsg: 'stale'
      }
    ]);
    const [list, detail, modal, queue] = await Promise.all([
      Call(listHandler, { auth: root, body: { datasetId: dataset._id, pageNum: 1, pageSize: 10 } }),
      Call(detailHandler, { auth: root, query: { id: collection._id } }),
      Call(trainingHandler, { auth: root, query: { collectionId: collection._id } }),
      Call(queueHandler, { auth: root, query: { datasetId: dataset._id } })
    ]);
    for (const response of [list, detail, modal, queue]) expect(response.code).toBe(200);
    const expected = {
      trainingAmount: 4,
      activeTrainingAmount: 3,
      finalErrorAmount: 1,
      hasError: true,
      slowestTrainingMode: TrainingModeEnum.rebuildSynonym
    };
    expect(list.data.list[0]).toMatchObject(expected);
    expect(detail.data).toMatchObject(expected);
    expect(modal.data).toMatchObject({
      queuedCounts: { rebuildSynonym: 0 },
      trainingCounts: { rebuildSynonym: 3, rebuildIndex: 0 },
      errorCounts: { rebuildSynonym: 1, rebuildIndex: 0 },
      trainedCount: 1
    });
    expect(queue.data).toEqual({ rebuildingCount: 4, trainingCount: 0 });
  });
});
