import { setTestLicenseActive } from '@test/utils/instanceConfigSnapshot';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  ParagraphChunkAIModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getRootUser } from '@test/datas/users';
import {
  addModelTestModel,
  getModelTestDefaults,
  getModelTestMap,
  setModelTestMap
} from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn(), paragraph: vi.fn() }));
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
vi.mock('@fastgpt/service/support/permission/teamLimit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/permission/teamLimit')>()),
  checkDatasetIndexLimit: vi.fn().mockResolvedValue(undefined)
}));
import { prepareDatasetCollectionParse } from '@/service/core/dataset/queues/datasetParse';

/** 创建真实的解析配置，模拟原文读取与 AI 请求。 */
const createParse = async ({
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
  return () =>
    prepareDatasetCollectionParse({
      collection,
      dataset,
      teamId: String(user.teamId),
      tmbId: String(user.tmbId),
      usageId: String(new Types.ObjectId())
    });
};

describe('prepareDatasetCollectionParse model validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({ rawText: 'Original source text.' });
    mocks.paragraph.mockReset();
    global.prepareDatasetCollectionParseLen = 0;
    setTestLicenseActive(true);
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
        const parse = await createParse({
          agentModelId: state === 'unconfigured' ? undefined : 'aux-model',
          vlmModelId: state === 'unconfigured' ? undefined : 'aux-model',
          imageIndex: true
        });
        expect(await parse()).toMatchObject({
          trainingMode: state === 'unconfigured' ? TrainingModeEnum.index : TrainingModeEnum.image,
          trainingData: [{ q: 'Original source text.' }]
        });
        expect(mocks.paragraph).not.toHaveBeenCalled();
      } finally {
        setModelTestMap(previousMap);
      }
    }
  );

  it('allows parsing with automatic indexing configured before the model is available', async () => {
    const parse = await createParse({ agentModelId: 'missing-agent', autoIndexes: true });
    expect(await parse()).toMatchObject({ trainingMode: TrainingModeEnum.auto });
  });

  it('propagates a required paragraph failure', async () => {
    const parse = await createParse({
      agentModelId: 'missing-agent',
      paragraphChunkAIMode: ParagraphChunkAIModeEnum.force
    });
    mocks.paragraph.mockRejectedValueOnce(new Error('paragraph endpoint: model unavailable'));
    await expect(parse()).rejects.toThrow('paragraph endpoint: model unavailable');
    expect(mocks.paragraph).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'missing-agent' })
    );
  });

  it('returns enhanced text and usage to commit together', async () => {
    const parse = await createParse({
      agentModelId: getModelTestDefaults().llm!.modelId,
      paragraphChunkAIMode: ParagraphChunkAIModeEnum.force
    });
    mocks.paragraph.mockResolvedValue({
      resultText: 'AI paragraph text.',
      totalInputTokens: 2,
      totalOutputTokens: 1
    });
    expect(await parse()).toMatchObject({
      trainingData: [{ q: 'AI paragraph text.' }],
      paragraphUsage: { inputTokens: 2, outputTokens: 1 }
    });
  });

  it('requires a valid embedding model before reading the source', async () => {
    const parse = await createParse({ vectorModelId: 'missing-vector' });
    await expect(parse()).rejects.toThrow();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.paragraph).not.toHaveBeenCalled();
  });
});

/**
 * 模板/备份导入即 CSV 结构化（逐行 q/a/index/metadata）。重解析必须逐行还原，
 * 不能被通用分块压成一条、也不能丢掉 metadata 与自定义 indexes。
 */
describe('prepareDatasetCollectionParse CSV structured collections', () => {
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
    global.prepareDatasetCollectionParseLen = 0;
    setTestLicenseActive(true);
  });

  it.each([
    DatasetCollectionDataProcessModeEnum.template,
    DatasetCollectionDataProcessModeEnum.backup
  ])('keeps every CSV row when reparsing a %s collection', async (trainingType) => {
    const parse = await createParse({ trainingType });
    const data = (await parse())?.trainingData ?? [];

    expect(data).toHaveLength(3);
    expect(data.map((item) => item.q)).toEqual(['问题一', '问题二', '问题三']);
    expect(data.map((item) => item.a)).toEqual(['答案一', '答案二', '答案三']);
    expect(data.map((item) => item.metadata)).toEqual([
      { src: 'doc1' },
      { src: 'doc2' },
      { src: 'doc3' }
    ]);

    expect(data.map((item) => item.indexes)).toEqual([
      [{ type: DatasetDataIndexTypeEnum.custom, text: '索引A' }],
      [{ type: DatasetDataIndexTypeEnum.custom, text: '索引B' }],
      [{ type: DatasetDataIndexTypeEnum.custom, text: '索引C' }]
    ]);

    // 行解析依赖原始 CSV：默认的 formatText 是 Markdown 表格，表头匹配不上会得到 0 条。
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ getFormatText: false }));
  });

  it('does not request raw CSV for non-CSV chunk collections', async () => {
    const parse = await createParse({ trainingType: DatasetCollectionDataProcessModeEnum.chunk });
    await parse();

    expect(mocks.read).not.toHaveBeenCalledWith(expect.objectContaining({ getFormatText: false }));
  });
});
