// 同义词队列入口已接管实例配置（94ae033d7）：enqueue 前判 isDatasetSynonymEnabled → 快照叶子 ?? serviceEnv。
// 本文件通过改写 serviceEnv.DATASET_SYNONYM_ENABLED 驱动，预置"域存在、叶子缺省"种子快照走兜底分支。
(global as any).systemInstanceConfig = {
  site: {},
  auth: {},
  security: {},
  feature: {},
  commercial: {},
  resource: {},
  performance: {
    workflow: {},
    parse: {},
    dataset: {},
    chat: {},
    streamResume: {},
    tracking: {},
    task: {},
    channel: {}
  },
  storage: {},
  vector: {},
  providers: {
    documentParse: { customPdf: {}, sangfor: {} },
    dataSource: {},
    externalProviderWorkflowVariables: []
  },
  subservice: {
    plugin: {},
    codeSandbox: {},
    aiProxy: {},
    mcp: {},
    agentSandbox: { provider: '', common: {}, sealosdevbox: {}, opensandbox: {}, proxy: {} }
  }
};

import listHandler from '@/pages/api/core/dataset/collection/listV2';
import detailHandler from '@/pages/api/core/dataset/collection/detail';
import trainingDetailHandler from '@/pages/api/core/dataset/collection/trainingDetail';
import dataListHandler from '@/pages/api/core/dataset/data/v2/list';
import dataDetailHandler from '@/pages/api/core/dataset/data/detail';
import type { ListCollectionV2ResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetQaTraining } from '@test/datas/datasetQaTraining';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexStatusEnum
} from '@fastgpt/global/core/dataset/data/constants';
import queueHandler from '@/pages/api/core/dataset/training/getDatasetTrainingQueue';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

describe('collection training status api', () => {
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

  it.each([
    [
      TrainingModeEnum.rebuildIndex,
      DatasetDataIndexStageEnum.rebuildIndexPending,
      DatasetDataIndexStageEnum.rebuildIndexRunning,
      DatasetDataIndexStatusEnum.rebuildIndexFailed
    ],
    [
      TrainingModeEnum.rebuildSynonym,
      DatasetDataIndexStageEnum.rebuildSynonymPending,
      DatasetDataIndexStageEnum.rebuildSynonymRunning,
      DatasetDataIndexStatusEnum.rebuildSynonymFailed
    ]
  ] as const)(
    'reports $0 phases and compatible public status values',
    async (mode, pending, running, failed) => {
      const context = await createDatasetCollectionFixture();
      const { root, scope } = context;
      const [waiting, processing, error] = await MongoDatasetData.create([
        { ...scope, q: 'Waiting', indexStatus: pending },
        { ...scope, q: 'Processing', indexStatus: running },
        { ...scope, q: 'Failed', indexStatus: running, indexError: true }
      ]);

      const [{ modal }, list, detail, failedDetail] = await Promise.all([
        readStatus(context),
        Call(dataListHandler, {
          auth: root,
          body: { collectionId: scope.collectionId, pageNum: 1, pageSize: 10 }
        }),
        Call(dataDetailHandler, { auth: root, query: { id: String(processing._id) } }),
        Call(dataDetailHandler, { auth: root, query: { id: String(error._id) } })
      ]);
      expect(modal).toMatchObject({
        queuedCounts: { [mode]: 1 },
        trainingCounts: { [mode]: 1 },
        errorCounts: { [mode]: 1 }
      });
      expect(list).toMatchObject({
        code: 200,
        data: {
          list: expect.arrayContaining([
            expect.objectContaining({ _id: String(waiting._id), indexStatus: pending }),
            expect.objectContaining({ _id: String(processing._id), indexStatus: running }),
            expect.objectContaining({
              _id: String(error._id),
              indexStatus: failed
            })
          ])
        }
      });
      expect(detail).toMatchObject({ code: 200, data: { indexStatus: running } });
      expect(failedDetail).toMatchObject({
        code: 200,
        data: { indexStatus: failed }
      });
      expect((await MongoDatasetData.findById(processing._id).lean())?.indexStatus).toBe(running);
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

    await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'saved content',
      indexStatus: DatasetDataIndexStageEnum.rebuildIndexRunning,
      indexError: true
    });
    await collection.updateOne({
      $set: {
        training: {
          status: 'active',
          usageId: String(new Types.ObjectId()),
          revision: 1,
          parse: { status: 'active' }
        }
      }
    });

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

  it('counts QA and parsing for the authorized collection only', async () => {
    const current = await createDatasetCollectionFixture();
    const foreign = await createDatasetCollectionFixture();
    await current.collection.updateOne({
      $set: {
        training: {
          status: 'active',
          usageId: String(new Types.ObjectId()),
          revision: 1,
          parse: { status: 'active' }
        }
      }
    });
    await MongoDatasetQaTraining.create([
      { ...current.scope, q: 'source', status: 'active' },
      { ...foreign.scope, q: 'source', status: 'active' },
      { ...foreign.scope, q: 'failed source', status: 'error', errorMsg: 'failed' }
    ]);

    expect(await readStatus(current)).toMatchObject({
      modal: {
        queuedCounts: { qa: 1, parse: 1 },
        trainingCounts: { qa: 0, parse: 0 },
        errorCounts: { qa: 0, parse: 0 }
      }
    });
  });
});
