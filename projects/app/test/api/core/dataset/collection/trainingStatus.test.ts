import listHandler from '@/pages/api/core/dataset/collection/listV2';
import scrollListHandler from '@/pages/api/core/dataset/collection/scrollList';
import detailHandler from '@/pages/api/core/dataset/collection/detail';
import trainingDetailHandler from '@/pages/api/core/dataset/collection/trainingDetail';
import {
  CollectionTrainingStatusEnum,
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetCollectionsListItemSchema } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('collection training status api', () => {
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
        mode: TrainingModeEnum.chunk,
        retryCount: 0,
        errorMsg: 'final error'
      }
    ]);

    const listRes = await Call(listHandler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        pageSize: 10,
        offset: 0,
        filterTags: []
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
        mode: TrainingModeEnum.chunk,
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
    expect(res.data.errorCounts.chunk).toBe(1);
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
        mode: TrainingModeEnum.chunk,
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
    expect(res.data.queuedCounts.chunk).toBe(0);
  });

  it('should keep deprecated scrollList compatible with the collection list item schema', async () => {
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

    await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'test',
      mode: TrainingModeEnum.chunk,
      retryCount: 0,
      errorMsg: 'final failed'
    });

    const res = await Call(scrollListHandler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        pageSize: 10,
        offset: 0,
        filterTags: []
      }
    });

    expect(res.code).toBe(200);
    expect(() => DatasetCollectionsListItemSchema.parse(res.data.list[0])).not.toThrow();
    expect(res.data.list[0]).toMatchObject({
      trainingAmount: 1,
      slowestTrainingStatus: CollectionTrainingStatusEnum.ready
    });
  });
});
