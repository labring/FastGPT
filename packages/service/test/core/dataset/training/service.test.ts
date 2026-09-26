import { describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  getDatasetIndexTrainingMode,
  skipDatasetTrainingEnhancement
} from '@fastgpt/service/core/dataset/training/service';

const createContext = async (indexStatus?: DatasetDataIndexStatusEnum) => {
  const context = {
    teamId: new Types.ObjectId().toString(),
    datasetId: new Types.ObjectId().toString(),
    collectionId: new Types.ObjectId().toString(),
    dataId: new Types.ObjectId().toString()
  };
  await MongoDatasetData.create({
    _id: context.dataId,
    ...context,
    tmbId: new Types.ObjectId(),
    q: 'content',
    chunkIndex: 0,
    indexStatus
  });
  return context;
};

describe('getDatasetIndexTrainingMode', () => {
  it.each([
    [DatasetDataIndexStatusEnum.indexing, TrainingModeEnum.index],
    [DatasetDataIndexStatusEnum.indexed, TrainingModeEnum.chunk],
    [DatasetDataIndexStatusEnum.error, TrainingModeEnum.chunk],
    [undefined, TrainingModeEnum.chunk]
  ])('routes data with status %s to %s', async (status, expected) => {
    expect(await getDatasetIndexTrainingMode(await createContext(status))).toBe(expected);
  });

  it('does not route missing, foreign or unassociated data to index', async () => {
    const context = await createContext(DatasetDataIndexStatusEnum.indexing);
    expect(await getDatasetIndexTrainingMode({ ...context, dataId: undefined })).toBe(
      TrainingModeEnum.chunk
    );
    expect(
      await getDatasetIndexTrainingMode({ ...context, dataId: new Types.ObjectId().toString() })
    ).toBe(TrainingModeEnum.chunk);
    expect(
      await getDatasetIndexTrainingMode({ ...context, teamId: new Types.ObjectId().toString() })
    ).toBe(TrainingModeEnum.chunk);
  });
});

describe('skipDatasetTrainingEnhancement', () => {
  it.each([TrainingModeEnum.auto, TrainingModeEnum.image] as const)(
    'preserves index and rebuild routes when skipping %s',
    async (mode) => {
      const fresh = await createContext(DatasetDataIndexStatusEnum.indexing);
      const indexed = await createContext(DatasetDataIndexStatusEnum.indexed);
      const [freshTask, rebuildTask, unrelated] = await MongoDatasetTraining.create(
        [fresh, indexed, fresh].map((context, i) => ({
          ...context,
          tmbId: new Types.ObjectId(),
          billId: 'test',
          mode: i === 2 ? TrainingModeEnum.qa : mode,
          retryCount: 3
        }))
      );
      await skipDatasetTrainingEnhancement(mode);
      expect((await MongoDatasetTraining.findById(freshTask._id).lean())?.mode).toBe(
        TrainingModeEnum.index
      );
      expect((await MongoDatasetTraining.findById(rebuildTask._id).lean())?.mode).toBe(
        TrainingModeEnum.chunk
      );
      expect((await MongoDatasetTraining.findById(unrelated._id).lean())?.mode).toBe(
        TrainingModeEnum.qa
      );
    }
  );
});
