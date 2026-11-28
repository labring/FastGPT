import deleteDataHandler from '@/pages/api/core/dataset/data/delete';
import pushHandler from '@/pages/api/core/dataset/data/pushData';
import deleteTrainingDataHandler from '@/pages/api/core/dataset/training/deleteTrainingData';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { datasetQaTrainingService } from '@fastgpt/service/core/dataset/training/qaService';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    bucketName: 'fastgpt-private',
    createGetDatasetFileURL: () => Promise.resolve({ url: 'http://localhost/mock-image' })
  })
}));

it('keeps the current round when QA or a failed chunk is removed while indexing work remains', async () => {
  const { root, dataset, scope } = await createDatasetCollectionFixture();
  const { collectionId } = scope;
  const { embedding, llm } = getModelTestDefaults();
  await dataset.updateOne({
    $set: { vectorModelId: embedding?.modelId, agentModelId: llm?.modelId }
  });
  const push = (texts: string[]) =>
    Call(pushHandler, {
      auth: root,
      body: {
        collectionId,
        trainingType: DatasetCollectionDataProcessModeEnum.chunk,
        data: texts.map((q) => ({ q }))
      }
    });
  const deleteFailed = async (id: string) => {
    await MongoDatasetData.updateOne({ _id: id }, { $set: { indexError: true } });
    expect(await Call(deleteDataHandler, { auth: root, query: { id } })).toMatchObject({
      code: 200
    });
  };
  const getRound = async () =>
    (await MongoDatasetCollection.findById(collectionId).lean())?.training;

  const first = await push(['Delete this chunk', 'Keep this chunk pending']);
  expect(first).toMatchObject({ code: 200, data: { insertLen: 2 } });
  const [removedId, pendingId] = first.data.dataIds;
  const originalUsageId = (await getRound())?.usageId;
  expect(originalUsageId).toBeDefined();

  const [qa] = await datasetQaTrainingService.createMany({
    items: [
      {
        teamId: String(scope.teamId),
        tmbId: String(scope.tmbId),
        datasetId: String(scope.datasetId),
        collectionId: String(scope.collectionId),
        q: 'Cancel this QA task',
        chunkIndex: 0,
        status: 'active'
      }
    ]
  });
  expect(
    await Call(deleteTrainingDataHandler, {
      auth: root,
      body: { collectionId, dataId: String(qa._id) }
    })
  ).toMatchObject({ code: 200 });
  expect(await datasetQaTrainingService.findById({ id: qa._id })).toBeNull();
  expect(String((await getRound())?.usageId)).toBe(String(originalUsageId));

  await deleteFailed(removedId);
  expect(await MongoDatasetData.findById(removedId)).toBeNull();
  expect(await MongoDatasetData.findById(pendingId)).not.toBeNull();
  expect(String((await getRound())?.usageId)).toBe(String(originalUsageId));

  await deleteFailed(pendingId);
  expect(await getRound()).toBeUndefined();
  expect(await push(['Start the next round'])).toMatchObject({ code: 200 });
  expect((await getRound())?.usageId).toBeDefined();
  expect(String((await getRound())?.usageId)).not.toBe(String(originalUsageId));
});
