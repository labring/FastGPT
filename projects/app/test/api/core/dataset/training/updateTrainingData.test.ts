import handler, {
  type updateTrainingDataBody,
  type updateTrainingDataResponse
} from '@/pages/api/core/dataset/training/updateTrainingData';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('update training data test', () => {
  it('should update training data', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test',
      teamId: root.teamId,
      tmbId: root.tmbId
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
      mode: TrainingModeEnum.chunk
    });

    const res = await Call<updateTrainingDataBody, {}, updateTrainingDataResponse>(handler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        collectionId: collection._id,
        dataId: trainingData._id,
        q: 'test',
        a: 'test',
        chunkIndex: 1
      }
    });

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

  it('should retry all error data when dataId is not provided', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test',
      teamId: root.teamId,
      tmbId: root.tmbId
    });
    const collection = await MongoDatasetCollection.create({
      name: 'test',
      type: DatasetCollectionTypeEnum.file,
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id
    });

    // 创建多个有错误信息的训练数据
    const errorTrainingData1 = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      mode: TrainingModeEnum.chunk,
      errorMsg: 'test error 1'
    });

    const errorTrainingData2 = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      mode: TrainingModeEnum.chunk,
      errorMsg: 'test error 2'
    });

    // 创建一个没有错误信息的训练数据（不应该被更新）
    const normalTrainingData = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      mode: TrainingModeEnum.chunk
    });

    const res = await Call<updateTrainingDataBody, {}, updateTrainingDataResponse>(handler, {
      auth: root,
      body: {
        datasetId: dataset._id,
        collectionId: collection._id
        // 不传 dataId，应该重试所有错误数据
      }
    });

    // 检查错误数据是否被更新
    const updatedErrorData1 = await MongoDatasetTraining.findOne({
      teamId: root.teamId,
      datasetId: dataset._id,
      _id: errorTrainingData1._id
    });

    const updatedErrorData2 = await MongoDatasetTraining.findOne({
      teamId: root.teamId,
      datasetId: dataset._id,
      _id: errorTrainingData2._id
    });

    const updatedNormalData = await MongoDatasetTraining.findOne({
      teamId: root.teamId,
      datasetId: dataset._id,
      _id: normalTrainingData._id
    });

    expect(res.code).toBe(200);
    // 错误数据应该被更新：errorMsg 被清除，retryCount 重置为 3
    expect(updatedErrorData1?.errorMsg).toBeUndefined();
    expect(updatedErrorData1?.retryCount).toBe(3);
    expect(updatedErrorData2?.errorMsg).toBeUndefined();
    expect(updatedErrorData2?.retryCount).toBe(3);
    // 正常数据不应该被更新
    expect(updatedNormalData?.retryCount).toBe(5); // 默认值
  });
});
