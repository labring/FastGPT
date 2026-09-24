import { getModelTestDefaults, addModelTestModel } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';
import { Types } from '@fastgpt/service/common/mongo';
import { mockVectorInsert, resetVectorMocks } from '@test/mocks/common/vector';
import { createMockVectorsResponse, mockGetVectors } from '@test/mocks/core/ai/embedding';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
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

const createContext = async ({
  metadata,
  indexStatus = DatasetDataIndexStatusEnum.parsed
}: {
  metadata?: Record<string, unknown>;
  indexStatus?: DatasetDataIndexStatusEnum;
} = {}) => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    name: 'qa pre create',
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

  const data = await MongoDatasetData.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    q: 'source chunk text',
    ...(metadata && { metadata }),
    chunkIndex: 3,
    indexes: [],
    indexStatus
  });

  const task = await MongoDatasetTraining.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    mode: TrainingModeEnum.qa,
    billId: new Types.ObjectId().toString(),
    dataId: data._id,
    q: 'source chunk text',
    ...(metadata && { dataMetadata: metadata }),
    chunkIndex: 3,
    retryCount: 5,
    lockTime: new Date('2000-01-01')
  });

  return { root, dataset, collection, data, task };
};

/** 让 QA 固定展开为三条叶子。 */
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

describe('generateQA pre-created data branch', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
    global.qaQueueLen = 0;
    global.systemEnv = { ...(global.systemEnv ?? {}), qaMaxProcess: 10 } as any;
    resetVectorMocks();
    mocks.llm.mockReset();
    mocks.usage.mockReset();
    embeddingModel = {
      ...getModelTestDefaults().embedding!,
      modelId: '507f1f77bcf86cd799439041',
      model: 'qa-pre-create-embedding',
      name: 'qa-pre-create-embedding',
      config: { ...getModelTestDefaults().embedding!.config, maxToken: 100, weight: 100 }
    };
    addModelTestModel(embeddingModel);
    mockGetVectors.mockImplementation(async ({ inputs }) =>
      createMockVectorsResponse(inputs.map((input) => input.input))
    );
    mockVectorInsert.mockResolvedValue({ insertIds: ['qa_vector_1'] });
  });

  /** CT-16：原数据成为第一叶子，新增两条 parsed 数据及任务，三条均保留源 metadata。 */
  it('replaces the source data with the first leaf and creates the remaining leaves', async () => {
    const metadata = { source: 'unit-test', page: 7 };
    const { data, task, collection } = await createContext({ metadata });
    mockQAResponse(3);

    await generateQA();

    const list = await MongoDatasetData.find({ collectionId: collection._id })
      .sort({ chunkIndex: 1 })
      .lean();
    expect(list).toHaveLength(3);

    // 源数据行复用为第一条叶子，不再有第三条数据行。
    const sourceRow = list.find((item) => String(item._id) === String(data._id));
    expect(sourceRow).toMatchObject({
      q: 'question 1',
      indexStatus: DatasetDataIndexStatusEnum.parsed,
      chunkIndex: 3
    });
    expect(sourceRow!.a?.trim()).toBe('answer 1');

    // 其余叶子为新建 parsed 数据，并复制源 metadata。
    const newLeaves = list.filter((item) => String(item._id) !== String(data._id));
    expect(newLeaves).toHaveLength(2);
    expect(newLeaves.map((item) => item.q).sort()).toEqual(['question 2', 'question 3']);
    newLeaves.forEach((item) => {
      expect(item.metadata).toMatchObject(metadata);
      expect(item.indexStatus).toBe(DatasetDataIndexStatusEnum.parsed);
      expect(item.indexes).toHaveLength(0);
    });
    expect(sourceRow!.metadata).toMatchObject(metadata);

    // 原 QA 任务改派为第一条叶子的 chunk 任务，保留 _id/dataId/billId。
    const tasks = await MongoDatasetTraining.find({ collectionId: collection._id }).lean();
    expect(tasks).toHaveLength(3);
    const reusedTask = tasks.find((item) => String(item._id) === String(task._id));
    expect(reusedTask).toMatchObject({
      mode: TrainingModeEnum.chunk,
      q: 'question 1',
      billId: task.billId
    });
    expect(reusedTask!.a?.trim()).toBe('answer 1');
    expect(String(reusedTask!.dataId)).toBe(String(data._id));

    // 新增任务与新增数据一一对应。
    const newTasks = tasks.filter((item) => String(item._id) !== String(task._id));
    expect(newTasks).toHaveLength(2);
    expect(newTasks.map((item) => String(item.dataId)).sort()).toEqual(
      newLeaves.map((item) => String(item._id)).sort()
    );
  });

  /** CT-16 / DS-17：源数据回到 parsed 时 indexes 保持为空且没有全文行。 */
  it('keeps indexes empty and writes no full-text row on the source data', async () => {
    const { data } = await createContext();
    mockQAResponse(2);

    await generateQA();

    const sourceRow = await MongoDatasetData.findById(data._id).lean();
    expect(sourceRow).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.parsed,
      indexes: []
    });
    expect(await MongoDatasetDataText.countDocuments({ dataId: data._id })).toBe(0);
  });

  /** CT-21：QA 切分为 0 条时源数据保持 parsed，不新增也不删除数据行。 */
  it('keeps the source data parsed and creates no row when QA yields nothing', async () => {
    const { data, task, collection } = await createContext();
    // 空原文 + 空回答 => 切分结果为 0 条。
    await MongoDatasetData.updateOne({ _id: data._id }, { $set: { q: '' } });
    await MongoDatasetTraining.updateOne({ _id: task._id }, { $set: { q: '' } });
    mocks.llm.mockResolvedValue({
      answerText: '',
      usage: { inputTokens: 1, outputTokens: 0 }
    });

    await generateQA();

    expect(await MongoDatasetData.countDocuments({ collectionId: collection._id })).toBe(1);
    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.parsed
    });
    // 任务按现有失败语义保留并记录错误。
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      mode: TrainingModeEnum.qa,
      errorMsg: expect.any(String)
    });
  });
});
