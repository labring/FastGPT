import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  ParagraphChunkAIModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';
import { Types } from '@fastgpt/service/common/mongo';

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

/** 创建真实的解析任务，读取原文与 AI 请求单独模拟，队列状态及后续入队使用测试数据库。 */
const createTask = async ({
  agentModelId,
  vlmModelId,
  vectorModelId = global.systemDefaultModel.embedding!.modelId,
  paragraphChunkAIMode = ParagraphChunkAIModeEnum.forbid,
  imageIndex = false,
  autoIndexes = false
}: {
  agentModelId?: string;
  vlmModelId?: string;
  vectorModelId?: string;
  paragraphChunkAIMode?: ParagraphChunkAIModeEnum;
  imageIndex?: boolean;
  autoIndexes?: boolean;
} = {}) => {
  const user = await getRootUser();
  const dataset = await MongoDataset.create({
    teamId: user.teamId,
    tmbId: user.tmbId,
    name: 'parse models',
    agentModelId,
    vlmModelId,
    vectorModelId
  });
  const collection = await MongoDatasetCollection.create({
    teamId: user.teamId,
    tmbId: user.tmbId,
    datasetId: dataset._id,
    name: 'source',
    type: DatasetCollectionTypeEnum.file,
    fileId: 'test-file',
    trainingType: DatasetCollectionDataProcessModeEnum.chunk,
    paragraphChunkAIMode,
    imageIndex,
    autoIndexes
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
  return { task, collection };
};

describe('datasetParseQueue model validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({ rawText: 'Original source text.' });
    mocks.paragraph.mockReset();
    global.datasetParseQueueLen = 0;
    global.feConfigs.isPlus = true;
  });

  it.each(['missing', 'disabled', 'wrong-type', 'unconfigured'])(
    'does not block parsing on %s auxiliary models',
    async (state) => {
      const previousMap = global.systemModelMap;
      global.systemModelMap = new Map(previousMap);
      if (state === 'disabled') {
        const model = {
          ...global.systemDefaultModel.llm!,
          modelId: 'aux-model',
          isActive: false,
          config: { ...global.systemDefaultModel.llm!.config, vision: true }
        };
        global.systemModelMap.set('id:aux-model', model);
      } else if (state === 'wrong-type') {
        global.systemModelMap.set('id:aux-model', global.systemDefaultModel.embedding!);
      }
      try {
        const { task, collection } = await createTask({
          agentModelId: state === 'unconfigured' ? undefined : 'aux-model',
          vlmModelId: state === 'unconfigured' ? undefined : 'aux-model',
          imageIndex: true
        });
        await datasetParseQueue();
        expect(await MongoDatasetTraining.findById(task._id)).toBeNull();
        expect(
          await MongoDatasetTraining.findOne({ collectionId: collection._id }).lean()
        ).toMatchObject({
          q: 'Original source text.',
          mode: state === 'unconfigured' ? TrainingModeEnum.chunk : TrainingModeEnum.image
        });
        expect(mocks.paragraph).not.toHaveBeenCalled();
        expect(mocks.usage).not.toHaveBeenCalled();
        expect(global.datasetParseQueueLen).toBe(0);
      } finally {
        global.systemModelMap = previousMap;
      }
    }
  );

  it('can enqueue automatic indexing without validating its model early', async () => {
    const { collection } = await createTask({ agentModelId: 'missing-agent', autoIndexes: true });
    await datasetParseQueue();
    expect(
      await MongoDatasetTraining.findOne({ collectionId: collection._id }).lean()
    ).toMatchObject({ mode: TrainingModeEnum.auto });
  });

  it('lets the AI paragraph endpoint reject the configured ID and records retries', async () => {
    const { task } = await createTask({
      agentModelId: 'missing-agent',
      paragraphChunkAIMode: ParagraphChunkAIModeEnum.force
    });
    mocks.paragraph.mockRejectedValue(new Error('paragraph endpoint: model unavailable'));
    await datasetParseQueue();
    expect(mocks.paragraph).toHaveBeenCalledTimes(5);
    expect(mocks.paragraph).toHaveBeenCalledWith(
      '/core/dataset/training/llmPargraph',
      expect.objectContaining({ modelId: 'missing-agent' }),
      expect.anything()
    );
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      mode: TrainingModeEnum.parse,
      retryCount: 0,
      errorMsg: 'paragraph endpoint: model unavailable'
    });
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it('retries a paragraph request failure and bills the subsequent success', async () => {
    const { task, collection } = await createTask({
      agentModelId: global.systemDefaultModel.llm!.modelId,
      paragraphChunkAIMode: ParagraphChunkAIModeEnum.force
    });
    mocks.paragraph.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValue({
      resultText: 'AI paragraph text.',
      totalInputTokens: 2,
      totalOutputTokens: 1
    });
    await datasetParseQueue();
    expect(mocks.paragraph).toHaveBeenCalledTimes(2);
    expect(await MongoDatasetTraining.findById(task._id)).toBeNull();
    expect(
      await MongoDatasetTraining.findOne({ collectionId: collection._id }).lean()
    ).toMatchObject({ q: 'AI paragraph text.', mode: TrainingModeEnum.chunk });
    expect(mocks.usage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ inputTokens: 2, outputTokens: 1 })
    );
  });

  it('keeps vector model errors blocking and records them on the parse task', async () => {
    const { task } = await createTask({ vectorModelId: 'missing-vector' });
    await datasetParseQueue();
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      mode: TrainingModeEnum.parse,
      retryCount: 0,
      errorMsg: expect.any(String)
    });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.paragraph).not.toHaveBeenCalled();
  });
});
