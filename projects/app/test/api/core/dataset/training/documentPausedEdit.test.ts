import updateTrainingHandler from '@/pages/api/core/dataset/training/updateTrainingData';
import { DatasetDataIndexStageEnum } from '@fastgpt/global/core/dataset/data/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { datasetQaTrainingService } from '@fastgpt/service/core/dataset/training/qaService';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { Call } from '@test/utils/request';
import { expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
vi.mock(import('@fastgpt/service/support/permission/teamLimit'), async (importOriginal) => {
  const { TeamErrEnum } = await import('@fastgpt/global/common/error/code/team');
  return {
    ...(await importOriginal()),
    checkTeamAIPoints: vi.fn().mockRejectedValue(TeamErrEnum.aiPointsNotEnough)
  };
});

it('saves permitted edits to pending training work while the document is still unpaid', async () => {
  const { scope, root } = await createDatasetCollectionFixture();
  const pausedAt = new Date();
  const usageId = String(new Types.ObjectId());
  await MongoDatasetCollection.updateOne(
    { _id: scope.collectionId },
    { $set: { training: { status: 'paused_unpaid', pausedAt, usageId, revision: 1 } } }
  );
  const common = { ...scope, tmbId: root.tmbId };
  const [qa] = await datasetQaTrainingService.createMany({
    items: [
      {
        teamId: String(common.teamId),
        tmbId: String(common.tmbId),
        datasetId: String(common.datasetId),
        collectionId: String(common.collectionId),
        q: 'Original QA source'
      }
    ]
  });
  const [chunk, image, rebuild] = await MongoDatasetData.create([
    { ...common, q: 'Original text', indexStatus: DatasetDataIndexStageEnum.index },
    { ...common, imageId: 'example.png', indexStatus: DatasetDataIndexStageEnum.imageParse },
    { ...common, q: 'Indexed text', indexStatus: DatasetDataIndexStageEnum.rebuildIndexPending }
  ]);
  const retry = (dataId: string, q: string) =>
    Call(updateTrainingHandler, {
      auth: root,
      body: { dataId, q, a: 'Edited answer', chunkIndex: 3 }
    });

  expect(await retry(String(qa._id), 'Edited QA source')).toMatchObject({ code: 200 });
  expect(await retry(String(chunk._id), 'Edited text')).toMatchObject({ code: 200 });
  const updateOne = vi.spyOn(MongoDatasetData, 'updateOne');
  const updateMany = vi.spyOn(MongoDatasetData, 'updateMany');
  try {
    expect(await retry(String(image._id), 'Image transcription')).toMatchObject({ code: 200 });
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
  } finally {
    updateOne.mockRestore();
    updateMany.mockRestore();
  }
  expect((await retry(String(rebuild._id), 'Disallowed edit')).code).not.toBe(200);

  const updatedQa = await datasetQaTrainingService.findById({ id: qa._id });
  expect(updatedQa).toMatchObject({ q: 'Edited QA source', chunkIndex: 3, status: 'active' });
  expect(updatedQa).not.toHaveProperty('a');
  expect(await MongoDatasetData.findById(chunk._id).lean()).toMatchObject({
    q: 'Edited text',
    a: 'Edited answer',
    chunkIndex: 3,
    indexStatus: DatasetDataIndexStageEnum.index
  });
  expect(await MongoDatasetData.findById(image._id).lean()).toMatchObject({
    q: 'Image transcription',
    a: 'Edited answer',
    chunkIndex: 3,
    indexStatus: DatasetDataIndexStageEnum.index
  });
  expect(await MongoDatasetData.findById(rebuild._id).lean()).toMatchObject({ q: 'Indexed text' });
  expect(await MongoDatasetCollection.findById(scope.collectionId).lean()).toMatchObject({
    training: { status: 'paused_unpaid', pausedAt, usageId }
  });
});
