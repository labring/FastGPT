import { getModelTestDefaults, addModelTestModel } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TrainingModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';
import { Types } from '@fastgpt/service/common/mongo';
import { serviceEnv } from '@fastgpt/service/env';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const mocks = vi.hoisted(() => ({ llm: vi.fn(), usage: vi.fn() }));

vi.mock('@/service/core/dataset/queues/utils', () => ({
  checkTeamAiPointsAndLock: vi.fn().mockResolvedValue(true)
}));
vi.mock('@fastgpt/service/core/ai/llm/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/llm/request')>()),
  createLLMResponse: mocks.llm
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/wallet/usage/controller')>()),
  pushLLMTrainingUsage: mocks.usage
}));

import { generateQA } from '@/service/core/dataset/queues/generateQA';

let embeddingModel: NonNullable<ReturnType<typeof getModelTestDefaults>['embedding']>;

const createContext = async () => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    name: 'qa post create',
    vectorModelId: embeddingModel.modelId,
    agentModelId: getModelTestDefaults().llm!.modelId
  });
  const collection = await MongoDatasetCollection.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    name: 'qa collection',
    type: DatasetCollectionTypeEnum.file,
    qaPrompt: 'split into qa'
  });

  const task = await MongoDatasetTraining.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    mode: TrainingModeEnum.qa,
    billId: new Types.ObjectId().toString(),
    q: 'source chunk text',
    dataMetadata: { source: 'unit-test', page: 7 },
    chunkIndex: 3,
    retryCount: 5,
    lockTime: new Date('2000-01-01')
  });

  return { dataset, collection, task };
};

const mockQAResponse = (qaCount: number) => {
  const answer = Array.from(
    { length: qaCount },
    (_, i) => `Q${i + 1}: question ${i + 1}\nA${i + 1}: answer ${i + 1}`
  ).join('\n');
  mocks.llm.mockResolvedValue({
    answerText: answer,
    usage: { inputTokens: 1, outputTokens: 1 }
  });
};

describe('generateQA writes data only after QA completes', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
    global.qaQueueLen = 0;
    global.systemEnv = { ...(global.systemEnv ?? {}), qaMaxProcess: 10 } as any;
    mocks.llm.mockReset();
    mocks.usage.mockReset();
    embeddingModel = {
      ...getModelTestDefaults().embedding!,
      modelId: '507f1f77bcf86cd799439041',
      model: 'qa-post-create-embedding',
      name: 'qa-post-create-embedding',
      config: { ...getModelTestDefaults().embedding!.config, maxToken: 100, weight: 100 }
    };
    addModelTestModel(embeddingModel);
  });

  it('does not create dataset data before QA and creates indexing rows after success', async () => {
    const { collection } = await createContext();
    mockQAResponse(3);

    expect(await MongoDatasetData.countDocuments({ collectionId: collection._id })).toBe(0);

    await generateQA();

    const rows = await MongoDatasetData.find({ collectionId: collection._id })
      .sort({ chunkIndex: 1 })
      .lean();
    expect(rows).toHaveLength(3);
    expect(rows.map((item) => item.q)).toEqual(['question 1', 'question 2', 'question 3']);
    expect(rows.every((item) => item.indexStatus === DatasetDataIndexStatusEnum.indexing)).toBe(
      true
    );
    expect(rows.every((item) => item.indexes.length === 0)).toBe(true);
    expect(rows.every((item) => item.metadata)).toBe(true);

    const tasks = await MongoDatasetTraining.find({ collectionId: collection._id }).lean();
    expect(tasks).toHaveLength(3);
    expect(tasks.every((item) => item.mode === TrainingModeEnum.index)).toBe(true);
    expect(tasks.map((item) => String(item.dataId)).sort()).toEqual(
      rows.map((item) => String(item._id)).sort()
    );
  });

  it('leaves no dataset data when QA produces no result', async () => {
    const { collection, task } = await createContext();
    await MongoDatasetTraining.updateOne({ _id: task._id }, { $set: { q: '' } });
    mocks.llm.mockResolvedValue({
      answerText: '',
      usage: { inputTokens: 1, outputTokens: 0 }
    });

    await generateQA();

    expect(await MongoDatasetData.countDocuments({ collectionId: collection._id })).toBe(0);
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      mode: TrainingModeEnum.qa,
      errorMsg: expect.any(String)
    });
  });
});
