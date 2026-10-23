import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  ParagraphChunkAIModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';
import {
  addModelTestModel,
  getModelTestDefaults,
  getModelTestMap,
  setModelTestMap
} from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn(), paragraph: vi.fn(), usage: vi.fn() }));
// 本文件需要验证真实模型状态，不能使用全局测试环境里始终返回成功的向量模型 getter。
vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) =>
  importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()
);
vi.mock('@fastgpt/service/core/dataset/read', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/read')>()),
  readDatasetSourceRawText: mocks.read
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPro/api', () => ({
  postCreateParagraphTitle: mocks.paragraph
}));
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
  vectorModelId = getModelTestDefaults().embedding!.modelId,
  paragraphChunkAIMode = ParagraphChunkAIModeEnum.forbid,
  imageIndex = false,
  autoIndexes = false,
  trainingType = DatasetCollectionDataProcessModeEnum.chunk
}: {
  agentModelId?: string;
  vlmModelId?: string;
  vectorModelId?: string;
  paragraphChunkAIMode?: ParagraphChunkAIModeEnum;
  imageIndex?: boolean;
  autoIndexes?: boolean;
  trainingType?: DatasetCollectionDataProcessModeEnum;
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
    trainingType,
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
      const previousMap = getModelTestMap();
      setModelTestMap(new Map(previousMap));
      if (state === 'disabled') {
        const model = {
          ...getModelTestDefaults().llm!,
          modelId: 'aux-model',
          isActive: false,
          config: { ...getModelTestDefaults().llm!.config, vision: true }
        };
        addModelTestModel(model);
      } else if (state === 'wrong-type') {
        addModelTestModel(getModelTestDefaults().embedding!);
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
          mode: state === 'unconfigured' ? TrainingModeEnum.index : TrainingModeEnum.image
        });
        expect(mocks.paragraph).not.toHaveBeenCalled();
        expect(mocks.usage).not.toHaveBeenCalled();
        expect(global.datasetParseQueueLen).toBe(0);
      } finally {
        setModelTestMap(previousMap);
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
      expect.objectContaining({ modelId: 'missing-agent' })
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
      agentModelId: getModelTestDefaults().llm!.modelId,
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
    ).toMatchObject({ q: 'AI paragraph text.', mode: TrainingModeEnum.index });
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

/**
 * 模板/备份导入即 CSV 结构化（逐行 q/a/index/metadata）。重解析必须逐行还原，
 * 不能被通用分块压成一条、也不能丢掉 metadata 与自定义 indexes。
 */
describe('datasetParseQueue CSV structured collections', () => {
  const templateCsv = [
    'q,a,index,metadata',
    '问题一,答案一,索引A,{"src":"doc1"}',
    '问题二,答案二,索引B,{"src":"doc2"}',
    '问题三,答案三,索引C,{"src":"doc3"}'
  ].join('\n');

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({ rawText: templateCsv });
    mocks.paragraph.mockReset();
    global.datasetParseQueueLen = 0;
    global.feConfigs.isPlus = true;
  });

  it.each([
    DatasetCollectionDataProcessModeEnum.template,
    DatasetCollectionDataProcessModeEnum.backup
  ])('keeps every CSV row when reparsing a %s collection', async (trainingType) => {
    const { collection } = await createTask({ trainingType });

    await datasetParseQueue();

    const data = await MongoDatasetData.find({ collectionId: collection._id })
      .sort({ chunkIndex: 1 })
      .lean();
    expect(data).toHaveLength(3);
    expect(data.map((item) => item.q)).toEqual(['问题一', '问题二', '问题三']);
    expect(data.map((item) => item.a)).toEqual(['答案一', '答案二', '答案三']);
    expect(data.map((item) => item.metadata)).toEqual([
      { src: 'doc1' },
      { src: 'doc2' },
      { src: 'doc3' }
    ]);

    const tasks = await MongoDatasetTraining.find({
      collectionId: collection._id,
      mode: TrainingModeEnum.index
    })
      .sort({ chunkIndex: 1 })
      .lean();
    expect(tasks).toHaveLength(3);
    expect(tasks.map((item) => item.indexes?.map(({ type, text }) => ({ type, text })))).toEqual([
      [{ type: DatasetDataIndexTypeEnum.custom, text: '索引A' }],
      [{ type: DatasetDataIndexTypeEnum.custom, text: '索引B' }],
      [{ type: DatasetDataIndexTypeEnum.custom, text: '索引C' }]
    ]);

    // 行解析依赖原始 CSV：默认的 formatText 是 Markdown 表格，表头匹配不上会得到 0 条。
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ getFormatText: false }));
  });

  it('does not request raw CSV for non-CSV chunk collections', async () => {
    await createTask({ trainingType: DatasetCollectionDataProcessModeEnum.chunk });

    await datasetParseQueue();

    expect(mocks.read).not.toHaveBeenCalledWith(expect.objectContaining({ getFormatText: false }));
  });
});
