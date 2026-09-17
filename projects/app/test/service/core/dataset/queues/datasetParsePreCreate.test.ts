import { getModelTestDefaults } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  ParagraphChunkAIModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { getRootUser } from '@test/datas/users';
import { Types } from '@fastgpt/service/common/mongo';
import { serviceEnv } from '@fastgpt/service/env';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { preCreateDatasetDataAndPushToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const mocks = vi.hoisted(() => ({ read: vi.fn(), paragraph: vi.fn(), usage: vi.fn() }));

// 本文件需要验证真实模型状态，不能使用全局测试环境里始终返回成功的向量模型 getter。
vi.mock('@fastgpt/service/core/ai/model', async (importOriginal) =>
  importOriginal<typeof import('@fastgpt/service/core/ai/model')>()
);
vi.mock('@fastgpt/service/core/dataset/read', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/read')>()),
  readDatasetSourceRawText: mocks.read
}));
vi.mock('@fastgpt/service/common/api/plusRequest', () => ({ POST: mocks.paragraph }));
vi.mock('@/service/core/dataset/queues/utils', () => ({
  checkTeamAiPointsAndLock: vi.fn().mockResolvedValue(true)
}));
vi.mock('@fastgpt/service/support/permission/teamLimit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/permission/teamLimit')>()),
  checkDatasetIndexLimit: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/wallet/usage/controller')>()),
  pushLLMTrainingUsage: mocks.usage
}));

import { datasetParseQueue } from '@/service/core/dataset/queues/datasetParse';

/** 创建真实的解析任务；原文读取与 AI 分段请求单独模拟，落库走测试数据库。 */
const createTask = async ({
  agentModelId,
  paragraphChunkAIMode = ParagraphChunkAIModeEnum.forbid
}: {
  agentModelId?: string;
  paragraphChunkAIMode?: ParagraphChunkAIModeEnum;
} = {}) => {
  const user = await getRootUser();
  const dataset = await MongoDataset.create({
    teamId: user.teamId,
    tmbId: user.tmbId,
    name: 'parse pre create',
    agentModelId,
    vectorModelId: getModelTestDefaults().embedding!.modelId
  });
  const collection = await MongoDatasetCollection.create({
    teamId: user.teamId,
    tmbId: user.tmbId,
    datasetId: dataset._id,
    name: 'source',
    type: DatasetCollectionTypeEnum.file,
    fileId: 'test-file',
    trainingType: DatasetCollectionDataProcessModeEnum.chunk,
    paragraphChunkAIMode
  });
  const task = await MongoDatasetTraining.create({
    teamId: user.teamId,
    tmbId: user.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    mode: TrainingModeEnum.parse,
    billId: new Types.ObjectId().toString(),
    retryCount: 5,
    lockTime: new Date('2000-01-01')
  });
  return { user, dataset, collection, task };
};

/** 只建 数据集/集合，用于直接调用预落库服务，不带解析任务。 */
const createEmptyContext = async () => {
  const user = await getRootUser();
  const dataset = await MongoDataset.create({
    teamId: user.teamId,
    tmbId: user.tmbId,
    name: 'pre create service',
    vectorModelId: getModelTestDefaults().embedding!.modelId
  });
  const collection = await MongoDatasetCollection.create({
    teamId: user.teamId,
    tmbId: user.tmbId,
    datasetId: dataset._id,
    name: 'source',
    type: DatasetCollectionTypeEnum.file,
    fileId: 'test-file'
  });
  return { user, dataset, collection };
};

describe('datasetParseQueue pre-creates parsed data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({ rawText: 'Original source text.' });
    mocks.paragraph.mockReset();
    global.datasetParseQueueLen = 0;
    global.feConfigs.isPlus = true;
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
  });

  /** CT-01：解析执行前数据列表不含本次分块。 */
  it('does not write dataset data before parse runs', async () => {
    const { dataset, collection } = await createTask();

    expect(await MongoDatasetData.countDocuments({ collectionId: collection._id })).toBe(0);
    expect(
      await MongoDatasetTraining.countDocuments({
        collectionId: collection._id,
        mode: TrainingModeEnum.parse
      })
    ).toBe(1);
    expect(await MongoDatasetData.countDocuments({ datasetId: dataset._id })).toBe(0);
  });

  /** CT-02：解析完成后写入 parsed 数据、indexes 为空且任务携带对应 dataId。 */
  it('persists parsed data sharing dataId with the downstream training task', async () => {
    const { collection } = await createTask();
    await datasetParseQueue();

    const list = await MongoDatasetData.find({ collectionId: collection._id }).lean();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      q: 'Original source text.',
      indexStatus: DatasetDataIndexStatusEnum.parsed,
      indexes: [],
      chunkIndex: 0
    });

    const tasks = await MongoDatasetTraining.find({ collectionId: collection._id }).lean();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].mode).toBe(TrainingModeEnum.chunk);
    expect(String(tasks[0].dataId)).toBe(String(list[0]._id));
  });

  /** CT-07 / DS-02：落库内容是段落增强合并后的最终切块，并保留现有业务字段。 */
  it('persists the final chunks after paragraph enhancement', async () => {
    const { collection } = await createTask({
      agentModelId: getModelTestDefaults().llm!.modelId,
      paragraphChunkAIMode: ParagraphChunkAIModeEnum.force
    });
    mocks.paragraph.mockResolvedValue({
      resultText: '# Final\n\nEnhanced paragraph content.',
      totalInputTokens: 2,
      totalOutputTokens: 1
    });

    await datasetParseQueue();

    const list = await MongoDatasetData.find({ collectionId: collection._id }).lean();
    expect(list.length).toBeGreaterThan(0);
    expect(list.map((item) => item.q).join('\n')).toContain('Enhanced paragraph content.');
    // LLM 内部请求片段不会落库。
    expect(list.map((item) => item.q).join('\n')).not.toContain('Q1:');
  });

  /** 解析失败时不落库：数据与任务写入在同一个成功事务内，失败保持数据列表不变。 */
  it('does not persist data when parse fails', async () => {
    const { task, collection } = await createTask({
      agentModelId: 'missing-agent',
      paragraphChunkAIMode: ParagraphChunkAIModeEnum.force
    });
    mocks.paragraph.mockRejectedValue(new Error('paragraph endpoint: model unavailable'));

    await datasetParseQueue();

    expect(await MongoDatasetData.countDocuments({ collectionId: collection._id })).toBe(0);
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      mode: TrainingModeEnum.parse,
      retryCount: 0
    });
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  /** CP-12 反例：未启用同义词时不写 synonymVersion。 */
  it('does not write synonymVersion when the dataset has no synonym config', async () => {
    const { collection } = await createTask();
    await datasetParseQueue();

    const data = await MongoDatasetData.findOne({ collectionId: collection._id }).lean();
    expect(data?.synonymVersion).toBeUndefined();
  });

  /** CP-12 正例：数据集启用同义词时，预落库数据与创建路径同源写入 synonymVersion。 */
  it('writes the dataset synonym version on pre-created data', async () => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    const { user, dataset, collection } = await createTask();
    await MongoDatasetSynonym.create({
      teamId: user.teamId,
      datasetId: dataset._id,
      version: 3
    });

    await datasetParseQueue();

    const data = await MongoDatasetData.findOne({ collectionId: collection._id }).lean();
    expect(data?.synonymVersion).toBe(3);
    // 预落库数据不会被同义词重建选为目标。
    expect(
      await MongoDatasetData.countDocuments({
        collectionId: collection._id,
        synonymVersion: { $ne: 3 }
      })
    ).toBe(0);
  });

  /** CP-07 / DS-02：预落库复制最终创建路径的业务字段，含 metadata 与 chunkIndex。 */
  it('persists metadata, imageId and chunkIndex with the training task', async () => {
    const { user, dataset, collection } = await createEmptyContext();
    const metadata = { source: 'csv-import', page: 2 };
    const billId = new Types.ObjectId().toString();

    await mongoSessionRun((session) =>
      preCreateDatasetDataAndPushToTrainingQueue({
        teamId: String(user.teamId),
        tmbId: String(user.tmbId),
        datasetId: String(dataset._id),
        collectionId: String(collection._id),
        vectorModel: getModelTestDefaults().embedding!,
        mode: TrainingModeEnum.chunk,
        billId,
        data: [
          { q: 'chunk with metadata', a: 'answer', metadata, chunkIndex: 7 },
          { imageId: 'dataset/team/cat.png', chunkIndex: 8 }
        ],
        session
      })
    );

    const rows = await MongoDatasetData.find({ collectionId: collection._id }).lean();
    expect(rows).toHaveLength(2);
    const withMetadata = rows.find((row) => row.chunkIndex === 7)!;
    expect(withMetadata).toMatchObject({
      q: 'chunk with metadata',
      a: 'answer',
      metadata,
      indexStatus: DatasetDataIndexStatusEnum.parsed,
      indexes: []
    });

    const imageRow = rows.find((row) => row.chunkIndex === 8)!;
    expect(imageRow).toMatchObject({ imageId: 'dataset/team/cat.png', q: '' });

    const tasks = await MongoDatasetTraining.find({ collectionId: collection._id }).lean();
    expect(tasks.map((task) => String(task.dataId)).sort()).toEqual(
      rows.map((row) => String(row._id)).sort()
    );
    expect(tasks.find((task) => String(task.dataId) === String(withMetadata._id))).toMatchObject({
      dataMetadata: metadata,
      mode: TrainingModeEnum.chunk,
      billId
    });
  });

  /** DS-06：空内容与超长内容在建数据行之前被过滤，不留无人处理的数据。 */
  it('does not create data rows for filtered chunks', async () => {
    const { user, dataset, collection } = await createEmptyContext();

    const result = await mongoSessionRun((session) =>
      preCreateDatasetDataAndPushToTrainingQueue({
        teamId: String(user.teamId),
        tmbId: String(user.tmbId),
        datasetId: String(dataset._id),
        collectionId: String(collection._id),
        vectorModel: getModelTestDefaults().embedding!,
        mode: TrainingModeEnum.chunk,
        billId: new Types.ObjectId().toString(),
        data: [{ q: '' }, { q: 'valid chunk' }],
        session
      })
    );

    expect(result.insertLen).toBe(1);
    expect(await MongoDatasetData.countDocuments({ collectionId: collection._id })).toBe(1);
    expect(await MongoDatasetTraining.countDocuments({ collectionId: collection._id })).toBe(1);
  });
});
