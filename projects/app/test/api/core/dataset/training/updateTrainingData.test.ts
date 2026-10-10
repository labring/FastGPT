import handler from '@/pages/api/core/dataset/training/updateTrainingData';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { BLOCKED_LOCK_TIME } from '@fastgpt/service/core/dataset/training/query';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getUser } from '@test/datas/users';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { Call } from '@test/utils/request';
import { Types } from '@fastgpt/service/common/mongo';
import { describe, expect, it } from 'vitest';

describe('updateTrainingData', () => {
  it.each([TrainingModeEnum.index, TrainingModeEnum.imageParse])(
    'edits %s output and ignores a legacy request datasetId',
    async (mode) => {
      const { root, scope } = await createDatasetCollectionFixture();
      const data = await MongoDatasetData.create({
        ...scope,
        q: 'original',
        indexStatus: DatasetDataIndexStatusEnum.indexing
      });
      const task = await MongoDatasetTraining.create({
        ...scope,
        dataId: data._id,
        billId: 'test',
        mode,
        imageId: 'dataset/team/image.png',
        retryCount: 0,
        errorMsg: 'failed'
      });
      const response = await Call(handler, {
        auth: root,
        body: {
          dataId: task._id,
          datasetId: new Types.ObjectId(),
          q: 'edited',
          a: '',
          chunkIndex: 1
        }
      });
      expect(response.code).toBe(200);
      expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
        ...scope,
        q: 'edited',
        a: '',
        chunkIndex: 1,
        mode: TrainingModeEnum.index,
        retryCount: 3,
        lockTime: new Date(0)
      });
      expect((await MongoDatasetTraining.findById(task._id).lean())?.errorMsg).toBeUndefined();
      // 编辑稿留在 training，worker 成功前不覆盖原数据。
      expect((await MongoDatasetData.findById(data._id).lean())?.q).toBe('original');
    }
  );

  it.each([
    {
      mode: TrainingModeEnum.rebuildIndex,
      failed: DatasetDataIndexStatusEnum.rebuildIndexFailed,
      running: DatasetDataIndexStatusEnum.rebuildIndexRunning
    },
    {
      mode: TrainingModeEnum.rebuildSynonym,
      failed: DatasetDataIndexStatusEnum.rebuildSynonymFailed,
      running: DatasetDataIndexStatusEnum.rebuildSynonymRunning
    }
  ])(
    'rejects $mode text edits and allows retry without text',
    async ({ mode, failed, running }) => {
      const { root, scope } = await createDatasetCollectionFixture();
      const data = await MongoDatasetData.create({
        ...scope,
        q: 'original',
        indexStatus: failed,
        indexErrorMsg: 'failed'
      });
      const task = await MongoDatasetTraining.create({
        ...scope,
        dataId: data._id,
        billId: 'test',
        mode,
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
      expect(updated?.indexStatus).toBe(running);
      expect(updated?.indexErrorMsg).toBeUndefined();
      expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
        retryCount: 3,
        mode
      });
    }
  );

  it.each(['collection', 'dataset'] as const)(
    'retries final and blocked errors only within the %s scope',
    async (target) => {
      const current = await createDatasetCollectionFixture();
      const siblingCollection = await MongoDatasetCollection.create({
        ...current.scope,
        name: 'sibling',
        type: DatasetCollectionTypeEnum.file
      });
      // 与 current 同知识库但不同集合的数据，只在 dataset 范围重试。
      const siblingScope = { ...current.scope, collectionId: siblingCollection._id };
      const foreign = await createDatasetCollectionFixture();
      const [finalError, blocked, active, sibling, outside] = await MongoDatasetTraining.create([
        {
          ...current.scope,
          billId: 'test',
          mode: TrainingModeEnum.index,
          retryCount: 0,
          errorMsg: 'final'
        },
        {
          ...current.scope,
          billId: 'test',
          mode: TrainingModeEnum.qa,
          retryCount: 1,
          lockTime: BLOCKED_LOCK_TIME,
          errorMsg: 'blocked'
        },
        {
          ...current.scope,
          billId: 'test',
          mode: TrainingModeEnum.index,
          retryCount: 3,
          errorMsg: 'temporary'
        },
        {
          ...siblingScope,
          billId: 'test',
          mode: TrainingModeEnum.qa,
          retryCount: 0,
          errorMsg: 'sibling'
        },
        {
          ...foreign.scope,
          billId: 'test',
          mode: TrainingModeEnum.index,
          retryCount: 0,
          errorMsg: 'outside'
        }
      ]);
      const body =
        target === 'collection'
          ? { collectionId: current.collection._id }
          : { datasetId: current.dataset._id };
      const response = await Call(handler, { auth: current.root, body });
      expect(response.code).toBe(200);
      for (const task of [finalError, blocked]) {
        const updated = await MongoDatasetTraining.findById(task._id).lean();
        expect(updated).toMatchObject({ retryCount: 3, lockTime: new Date(0) });
        expect(updated?.errorMsg).toBeUndefined();
      }
      expect(await MongoDatasetTraining.findById(active._id).lean()).toMatchObject({
        retryCount: 3,
        errorMsg: 'temporary'
      });
      expect(await MongoDatasetTraining.findById(outside._id).lean()).toMatchObject({
        retryCount: 0,
        errorMsg: 'outside'
      });
      const updatedSibling = await MongoDatasetTraining.findById(sibling._id).lean();
      expect(updatedSibling?.retryCount).toBe(target === 'dataset' ? 3 : 0);
      expect(updatedSibling?.errorMsg).toBe(target === 'dataset' ? undefined : 'sibling');
    }
  );

  it.each(['single', 'collection', 'dataset'] as const)(
    'restores failed data to indexing on %s retry',
    async (target) => {
      const { root, dataset, collection, scope } = await createDatasetCollectionFixture();
      const data = await MongoDatasetData.create({
        ...scope,
        q: 'original',
        indexStatus: DatasetDataIndexStatusEnum.error,
        indexErrorMsg: 'failed'
      });
      const task = await MongoDatasetTraining.create({
        ...scope,
        dataId: data._id,
        billId: 'test',
        mode: TrainingModeEnum.index,
        retryCount: 0,
        errorMsg: 'failed'
      });
      const body = (() => {
        if (target === 'single') return { dataId: task._id, q: 'edited' };
        if (target === 'collection') return { collectionId: collection._id };
        return { datasetId: dataset._id };
      })();
      expect((await Call(handler, { auth: root, body })).code).toBe(200);
      const updated = await MongoDatasetData.findById(data._id).lean();
      expect(updated?.indexStatus).toBe(DatasetDataIndexStatusEnum.indexing);
      expect(updated?.indexErrorMsg).toBeUndefined();
      const updatedTask = await MongoDatasetTraining.findById(task._id).lean();
      expect(updatedTask).toMatchObject({ mode: TrainingModeEnum.index, retryCount: 3 });
      expect(updatedTask?.errorMsg).toBeUndefined();
      if (target === 'single') expect(updatedTask?.q).toBe('edited');
    }
  );

  it('does not let request datasetId bypass the item collection authorization', async () => {
    const current = await createDatasetCollectionFixture({ user: await getUser('normal-user') });
    const foreign = await createDatasetCollectionFixture({ user: await getUser('foreign-user') });
    const task = await MongoDatasetTraining.create({
      ...foreign.scope,
      billId: 'test',
      mode: TrainingModeEnum.index,
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
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      q: 'original',
      a: 'original'
    });
  });

  it.each(['missing', 'team', 'dataset'] as const)(
    'rejects a %s task boundary without updating the task',
    async (boundary) => {
      const { root, scope } = await createDatasetCollectionFixture();
      const task = await MongoDatasetTraining.create({
        ...scope,
        billId: 'test',
        mode: TrainingModeEnum.index,
        q: 'original'
      });
      if (boundary === 'missing') await MongoDatasetTraining.deleteOne({ _id: task._id });
      else
        await MongoDatasetTraining.updateOne(
          { _id: task._id },
          { $set: { [boundary === 'team' ? 'teamId' : 'datasetId']: new Types.ObjectId() } }
        );
      const response = await Call(handler, {
        auth: root,
        body: { dataId: task._id, q: 'changed' }
      });
      expect(response.code).not.toBe(200);
      if (boundary !== 'missing')
        expect((await MongoDatasetTraining.findById(task._id).lean())?.q).toBe('original');
    }
  );
});
