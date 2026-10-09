import handler from '@/pages/api/core/dataset/training/updateTrainingData';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type {
  UpdateTrainingDataBody,
  UpdateTrainingDataResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getRootUser, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

type EmptyQuery = Record<string, never>;

describe('update training data test', () => {
  it('rejects text edits on rebuild tasks and allows retry without text', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'rebuild',
      teamId: root.teamId,
      tmbId: root.tmbId
    });
    const collection = await MongoDatasetCollection.create({
      name: 'rebuild',
      type: DatasetCollectionTypeEnum.file,
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id
    });
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'original',
      indexStatus: DatasetDataIndexStatusEnum.rebuildIndexFailed,
      indexErrorMsg: 'failed'
    });
    const task = await MongoDatasetTraining.create({
      dataId: data._id,
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'rebuild',
      mode: TrainingModeEnum.rebuild,
      retryCount: 0,
      errorMsg: 'failed'
    });
    const edit = await Call(handler, { auth: root, body: { dataId: task._id, a: '' } });
    expect(edit.code).not.toBe(200);
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      retryCount: 0,
      errorMsg: 'failed'
    });
    const retry = await Call(handler, { auth: root, body: { dataId: task._id } });
    expect(retry.code).toBe(200);
    const updated = await MongoDatasetData.findById(data._id).lean();
    expect(updated?.indexStatus).toBe(DatasetDataIndexStatusEnum.rebuildIndexRunning);
    expect(updated?.indexErrorMsg).toBeUndefined();
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({ retryCount: 3 });
  });

  it('should update training data', async () => {
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
    const trainingData = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'test',
      mode: TrainingModeEnum.index
    });

    const res = await Call<UpdateTrainingDataBody, EmptyQuery, UpdateTrainingDataResponse>(
      handler,
      {
        auth: root,
        body: {
          dataId: trainingData._id,
          q: 'test',
          a: 'test',
          chunkIndex: 1
        }
      }
    );

    const updatedTrainingData = await MongoDatasetTraining.findOne({
      teamId: root.teamId,
      datasetId: dataset._id,
      _id: trainingData._id
    });

    expect(res.code).toBe(200);
    expect(updatedTrainingData?.q).toBe('test');
    expect(updatedTrainingData?.a).toBe('test');
    expect(updatedTrainingData?.chunkIndex).toBe(1);
  });

  it('should retry single training data by dataId', async () => {
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
    const trainingData = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'test',
      mode: TrainingModeEnum.index,
      errorMsg: 'failed',
      retryCount: 0
    });

    const res = await Call<UpdateTrainingDataBody, EmptyQuery, UpdateTrainingDataResponse>(
      handler,
      {
        auth: root,
        body: {
          dataId: trainingData._id,
          q: 'retry'
        }
      }
    );

    const updatedTrainingData = await MongoDatasetTraining.findById(trainingData._id).lean();

    expect(res.code).toBe(200);
    expect(updatedTrainingData?.q).toBe('retry');
    expect(updatedTrainingData?.errorMsg).toBeUndefined();
    expect(updatedTrainingData?.retryCount).toBe(3);
  });

  it('should retry only final errors in collection scope', async () => {
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
    const [finalError, activeRetry] = await MongoDatasetTraining.create([
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.rebuild,
        retryCount: 0,
        errorMsg: 'final error'
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test',
        mode: TrainingModeEnum.rebuild,
        retryCount: 3,
        errorMsg: 'temporary error'
      }
    ]);

    const res = await Call<UpdateTrainingDataBody, EmptyQuery, UpdateTrainingDataResponse>(
      handler,
      {
        auth: root,
        body: {
          collectionId: collection._id
        }
      }
    );

    const updatedFinalError = await MongoDatasetTraining.findById(finalError._id).lean();
    const updatedActiveRetry = await MongoDatasetTraining.findById(activeRetry._id).lean();

    expect(res.code).toBe(200);
    expect(updatedFinalError?.errorMsg).toBeUndefined();
    expect(updatedFinalError?.retryCount).toBe(3);
    expect(updatedActiveRetry?.errorMsg).toBe('temporary error');
  });

  it('should retry only final errors in dataset scope', async () => {
    const root = await getRootUser();
    const [dataset, foreignDataset] = await MongoDataset.create([
      {
        name: 'test',
        teamId: root.teamId,
        tmbId: root.tmbId,
        vectorModel: 'test',
        agentModel: 'test'
      },
      {
        name: 'foreign',
        teamId: root.teamId,
        tmbId: root.tmbId,
        vectorModel: 'test',
        agentModel: 'test'
      }
    ]);
    const [collection, anotherCollection, foreignCollection] = await MongoDatasetCollection.create([
      {
        name: 'test',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id
      },
      {
        name: 'another',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id
      },
      {
        name: 'foreign',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: foreignDataset._id
      }
    ]);
    const [datasetFinalError, datasetBlockedError, datasetActiveRetry, foreignFinalError] =
      await MongoDatasetTraining.create([
        {
          teamId: root.teamId,
          tmbId: root.tmbId,
          datasetId: dataset._id,
          collectionId: collection._id,
          billId: 'test',
          mode: TrainingModeEnum.rebuild,
          retryCount: 0,
          errorMsg: 'final error'
        },
        {
          teamId: root.teamId,
          tmbId: root.tmbId,
          datasetId: dataset._id,
          collectionId: anotherCollection._id,
          billId: 'test',
          mode: TrainingModeEnum.qa,
          retryCount: 1,
          lockTime: new Date('2999'),
          errorMsg: 'blocked error'
        },
        {
          teamId: root.teamId,
          tmbId: root.tmbId,
          datasetId: dataset._id,
          collectionId: collection._id,
          billId: 'test',
          mode: TrainingModeEnum.rebuild,
          retryCount: 3,
          errorMsg: 'temporary error'
        },
        {
          teamId: root.teamId,
          tmbId: root.tmbId,
          datasetId: foreignDataset._id,
          collectionId: foreignCollection._id,
          billId: 'test',
          mode: TrainingModeEnum.rebuild,
          retryCount: 0,
          errorMsg: 'foreign final error'
        }
      ]);

    const res = await Call<UpdateTrainingDataBody, EmptyQuery, UpdateTrainingDataResponse>(
      handler,
      {
        auth: root,
        body: {
          datasetId: dataset._id
        }
      }
    );

    const [updatedFinalError, updatedBlockedError, updatedActiveRetry, updatedForeignFinalError] =
      await Promise.all([
        MongoDatasetTraining.findById(datasetFinalError._id).lean(),
        MongoDatasetTraining.findById(datasetBlockedError._id).lean(),
        MongoDatasetTraining.findById(datasetActiveRetry._id).lean(),
        MongoDatasetTraining.findById(foreignFinalError._id).lean()
      ]);

    expect(res.code).toBe(200);
    expect(updatedFinalError?.errorMsg).toBeUndefined();
    expect(updatedFinalError?.retryCount).toBe(3);
    expect(updatedBlockedError?.errorMsg).toBeUndefined();
    expect(updatedBlockedError?.retryCount).toBe(3);
    expect(updatedBlockedError?.lockTime?.getTime()).toBe(new Date(0).getTime());
    expect(updatedActiveRetry?.errorMsg).toBe('temporary error');
    expect(updatedForeignFinalError?.errorMsg).toBe('foreign final error');
  });

  it('should not let request datasetId bypass item collection authorization', async () => {
    const [user, foreignUser] = await Promise.all([
      getUser('normal-user'),
      getUser('foreign-user')
    ]);
    const [dataset, foreignDataset] = await MongoDataset.create([
      {
        name: 'test',
        teamId: user.teamId,
        tmbId: user.tmbId,
        vectorModel: 'test',
        agentModel: 'test'
      },
      {
        name: 'foreign',
        teamId: foreignUser.teamId,
        tmbId: foreignUser.tmbId,
        vectorModel: 'test',
        agentModel: 'test'
      }
    ]);
    const foreignCollection = await MongoDatasetCollection.create({
      name: 'foreign',
      type: DatasetCollectionTypeEnum.file,
      teamId: foreignUser.teamId,
      tmbId: foreignUser.tmbId,
      datasetId: foreignDataset._id
    });
    const foreignTrainingData = await MongoDatasetTraining.create({
      teamId: foreignUser.teamId,
      tmbId: foreignUser.tmbId,
      datasetId: foreignDataset._id,
      collectionId: foreignCollection._id,
      billId: 'test',
      mode: TrainingModeEnum.rebuild,
      q: 'origin',
      a: 'origin'
    });

    const res = await Call<UpdateTrainingDataBody, EmptyQuery, UpdateTrainingDataResponse>(
      handler,
      {
        auth: user,
        body: {
          datasetId: dataset._id,
          dataId: foreignTrainingData._id,
          q: 'changed',
          a: 'changed'
        } as any
      }
    );

    const existingTrainingData = await MongoDatasetTraining.findById(foreignTrainingData._id);

    expect(res.code).not.toBe(200);
    expect(existingTrainingData?.q).toBe('origin');
    expect(existingTrainingData?.a).toBe('origin');
  });
  it('should restore data indexStatus from error to indexing during single and batch retry', async () => {
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
    const [dataSingle, dataBatch] = await MongoDatasetData.create([
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        q: 'single data',
        a: 'single a',
        indexStatus: DatasetDataIndexStatusEnum.error,
        indexErrorMsg: 'prev error'
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        q: 'batch data',
        a: 'batch a',
        indexStatus: DatasetDataIndexStatusEnum.error,
        indexErrorMsg: 'prev error'
      }
    ]);

    const [trainingSingle] = await MongoDatasetTraining.create([
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        dataId: String(dataSingle._id),
        billId: 'test',
        mode: TrainingModeEnum.index,
        imageId: 'dataset/team/image.png',
        errorMsg: 'failed',
        retryCount: 0
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        dataId: String(dataBatch._id),
        billId: 'test',
        mode: TrainingModeEnum.index,
        imageId: 'dataset/team/image.png',
        errorMsg: 'failed',
        retryCount: 0
      }
    ]);

    // Single retry
    await Call<UpdateTrainingDataBody, EmptyQuery, UpdateTrainingDataResponse>(handler, {
      auth: root,
      body: {
        dataId: trainingSingle._id,
        q: 'single retry'
      }
    });

    const updatedDataSingle = await MongoDatasetData.findById(dataSingle._id).lean();
    expect(updatedDataSingle?.indexStatus).toBe(DatasetDataIndexStatusEnum.indexing);
    expect(updatedDataSingle?.indexErrorMsg).toBeUndefined();
    expect((await MongoDatasetTraining.findById(trainingSingle._id).lean())?.mode).toBe(
      TrainingModeEnum.index
    );

    // Batch retry
    await Call<UpdateTrainingDataBody, EmptyQuery, UpdateTrainingDataResponse>(handler, {
      auth: root,
      body: {
        collectionId: collection._id
      }
    });

    const updatedDataBatch = await MongoDatasetData.findById(dataBatch._id).lean();
    expect(updatedDataBatch?.indexStatus).toBe(DatasetDataIndexStatusEnum.indexing);
    expect(updatedDataBatch?.indexErrorMsg).toBeUndefined();
  });
});
