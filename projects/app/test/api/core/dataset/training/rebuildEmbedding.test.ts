import { beforeEach, describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/dataset/training/rebuildEmbedding';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

const registerEmbeddingModel = ({ model, vision = false }: { model: string; vision?: boolean }) => {
  global.embeddingModelMap.set(model, {
    ...global.systemDefaultModel.embedding,
    model,
    name: model,
    vision
  });
};

const registerVlmModel = (model: string) => {
  global.llmModelMap.set(model, {
    ...global.systemDefaultModel.llm,
    model,
    name: model,
    vision: true
  });
};

const createDatasetContext = async ({ vlmModel }: { vlmModel?: string } = {}) => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    name: 'test dataset',
    teamId: root.teamId,
    tmbId: root.tmbId,
    vectorModel: 'old-embedding',
    agentModel: 'gpt-5',
    vlmModel
  });
  const collection = await MongoDatasetCollection.create({
    name: 'test collection',
    type: DatasetCollectionTypeEnum.file,
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    imageIndex: true
  });

  return { root, dataset, collection };
};

describe('POST /api/core/dataset/training/rebuildEmbedding', () => {
  beforeEach(() => {
    global.systemEnv = {
      ...global.systemEnv,
      vectorMaxProcess: 1
    };
    registerEmbeddingModel({ model: 'old-embedding' });
    registerEmbeddingModel({ model: 'vision-embedding', vision: true });
    registerEmbeddingModel({ model: 'text-only-embedding' });
    registerVlmModel('dataset-vlm-model');
  });

  it('should keep image index and enqueue image mode when the new embedding model supports images', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'question with ![cat](dataset/team/cat.png)',
      indexes: [
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: 'manual index',
          dataId: 'manual_id'
        }
      ]
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModel: 'vision-embedding'
      }
    });

    const updatedDataset = await MongoDataset.findById(dataset._id).lean();
    const updatedCollection = await MongoDatasetCollection.findById(collection._id).lean();
    const training = await MongoDatasetTraining.findOne({ dataId: data._id }).lean();

    expect(res.code).toBe(200);
    expect(updatedDataset?.vectorModel).toBe('vision-embedding');
    expect(updatedCollection?.imageIndex).toBe(true);
    expect(training).toEqual(
      expect.objectContaining({
        mode: TrainingModeEnum.image,
        q: 'question with ![cat](dataset/team/cat.png)',
        retryCount: 50
      })
    );
    expect(training?.indexes).toEqual([
      expect.objectContaining({
        type: DatasetDataIndexTypeEnum.custom,
        text: 'manual index'
      })
    ]);
  });

  it('should disable image index and enqueue chunk mode when the new embedding model has no image capability', async () => {
    const { root, dataset, collection } = await createDatasetContext();
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'question with ![cat](dataset/team/cat.png)'
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModel: 'text-only-embedding'
      }
    });

    const updatedDataset = await MongoDataset.findById(dataset._id).lean();
    const updatedCollection = await MongoDatasetCollection.findById(collection._id).lean();
    const training = await MongoDatasetTraining.findOne({ dataId: data._id }).lean();

    expect(res.code).toBe(200);
    expect(updatedDataset?.vectorModel).toBe('text-only-embedding');
    expect(updatedDataset?.chunkSettings?.imageIndex).toBe(false);
    expect(updatedCollection?.imageIndex).toBe(false);
    expect(training).toEqual(
      expect.objectContaining({
        mode: TrainingModeEnum.chunk,
        retryCount: 50
      })
    );
    expect(training?.q).toBe('');
  });

  it('should enqueue imageParse mode with VLM model for image data when VLM is configured', async () => {
    const { root, dataset, collection } = await createDatasetContext({
      vlmModel: 'dataset-vlm-model'
    });
    const data = await MongoDatasetData.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: '',
      imageId: 'dataset/team/main.png'
    });

    const res = await Call(handler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        vectorModel: 'text-only-embedding'
      }
    });

    const training = await MongoDatasetTraining.findOne({ dataId: data._id }).lean();

    expect(res.code).toBe(200);
    expect(training).toEqual(
      expect.objectContaining({
        mode: TrainingModeEnum.imageParse,
        imageId: 'dataset/team/main.png',
        retryCount: 50
      })
    );
  });
});
