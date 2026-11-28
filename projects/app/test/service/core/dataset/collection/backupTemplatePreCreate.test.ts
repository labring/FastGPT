import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStageEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { serviceEnv } from '@fastgpt/service/env';
import { countPromptTokensInWorker } from '@fastgpt/service/worker/countGptMessagesTokens/count';
import { getRootUser } from '@test/datas/users';
import { mockVectorInsert, resetVectorMocks } from '@test/mocks/common/vector';
import { createMockVectorsResponse, mockGetVectors } from '@test/mocks/core/ai/embedding';
import { addModelTestModel, getModelTestDefaults } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const { mockCountPromptTokens } = vi.hoisted(() => ({
  mockCountPromptTokens: vi.fn()
}));

// 自定义索引会经 buildEmbeddingSafeIndexTexts 走 token 计数 worker，而 worker 产物
// projects/app/worker/*.js 被 gitignore，CI 的干净 checkout 里不存在。与 dataIndex.test.ts
// 保持一致：mock 掉 worker 调用，直接使用进程内的纯函数实现，保留真实计数语义。
vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countPromptTokens: mockCountPromptTokens
}));
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokens: mockCountPromptTokens
}));

// 本文件需要真实模型状态，不能使用全局测试环境里始终返回成功的向量模型 getter。
vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) =>
  importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()
);
vi.mock('@fastgpt/service/support/permission/teamLimit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/permission/teamLimit')>()),
  checkDatasetIndexLimit: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/wallet/usage/controller')>()),
  createTrainingUsage: vi.fn().mockResolvedValue({ usageId: '507f1f77bcf86cd799439070' })
}));

import { initDatasetTrainingWorker } from '@/service/core/dataset/training/documentWorker';
import { bullMQ } from '@fastgpt/dal/redis/bullmq';
import { closeRedisRuntime, configureRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';

let embeddingModel: NonNullable<ReturnType<typeof getModelTestDefaults>['embedding']>;

/** 备份/模板导入格式：q/a 必备，indexes 列承载自定义索引。 */
const buildBackupCsv = (rows: { q: string; a?: string; index?: string }[]) => {
  const lines = ['q,a,indexes'];
  rows.forEach((r) => {
    lines.push(
      [r.q, r.a ?? '', r.index ?? '']
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',')
    );
  });
  return lines.join('\n');
};

const createDataset = async () => {
  const user = await getRootUser();
  const dataset = await MongoDataset.create({
    teamId: user.teamId,
    tmbId: user.tmbId,
    name: 'backup pre create',
    agentModelId: getModelTestDefaults().llm!.modelId,
    vectorModelId: embeddingModel.modelId
  });
  return { user, dataset };
};

const insertCollection = async ({
  trainingType,
  rawText,
  name
}: {
  trainingType: DatasetCollectionDataProcessModeEnum;
  rawText: string;
  name: string;
}) => {
  const { dataset } = await createDataset();
  const result = await createCollectionAndInsertData({
    dataset,
    rawText,
    // 与生产一致：backup 与 template 都按备份格式切分。
    backupParse:
      trainingType === DatasetCollectionDataProcessModeEnum.backup ||
      trainingType === DatasetCollectionDataProcessModeEnum.template,
    createCollectionParams: {
      teamId: String(dataset.teamId),
      tmbId: String(dataset.tmbId),
      datasetId: String(dataset._id),
      name,
      type: DatasetCollectionTypeEnum.file,
      trainingType
    }
  });
  return { dataset, collectionId: result.collectionId };
};

describe('backup / template pre-created data', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
    resetVectorMocks();
    mockCountPromptTokens.mockReset();
    mockCountPromptTokens.mockImplementation(async (text: string) =>
      countPromptTokensInWorker(text)
    );
    embeddingModel = {
      ...getModelTestDefaults().embedding!,
      modelId: '507f1f77bcf86cd799439051',
      model: 'backup-pre-create-embedding',
      name: 'backup-pre-create-embedding',
      config: { ...getModelTestDefaults().embedding!.config, maxToken: 100, weight: 100 }
    };
    addModelTestModel(embeddingModel);
    mockGetVectors.mockImplementation(async ({ inputs }) =>
      createMockVectorsResponse(inputs.map((input) => input.input))
    );
    mockVectorInsert.mockResolvedValue({ insertIds: ['backup_vector_1'] });
  });

  /** 备份导入的内容在请求内已切好，应先落库再更新索引。 */
  it('persists backup chunks before indexing', async () => {
    const { collectionId } = await insertCollection({
      trainingType: DatasetCollectionDataProcessModeEnum.backup,
      name: 'backup.csv',
      rawText: buildBackupCsv([{ q: '备份问题一' }, { q: '备份问题二', a: '备份答案二' }])
    });

    const rows = await MongoDatasetData.find({ collectionId }).lean();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.indexStatus === DatasetDataIndexStageEnum.index)).toBe(true);
    // 待索引数据尚无向量，索引数组应为空。
    expect(rows.every((row) => (row.indexes ?? []).length === 0)).toBe(true);

    expect(await MongoDatasetCollection.findById(collectionId).lean()).toHaveProperty(
      'training.usageId'
    );
  });

  it('rejects unauthorized embedding before creating a collection', async () => {
    const { dataset, user } = await createDataset();
    const modelHandle = await getTeamModelHandle({ teamId: String(user.teamId) });

    await expect(
      createCollectionAndInsertData({
        dataset,
        modelAuthContext: { modelHandle, authorizedIds: new Set<string>() },
        createCollectionParams: {
          teamId: String(dataset.teamId),
          tmbId: String(dataset.tmbId),
          datasetId: String(dataset._id),
          name: 'unauthorized.csv',
          type: DatasetCollectionTypeEnum.file
        }
      })
    ).rejects.toThrow();

    expect(await MongoDatasetCollection.countDocuments({ datasetId: dataset._id })).toBe(0);
  });

  /** 模板导入与备份导入同源，行为应一致。 */
  it('persists template chunks before indexing', async () => {
    const { collectionId } = await insertCollection({
      trainingType: DatasetCollectionDataProcessModeEnum.template,
      name: 'template.csv',
      rawText: buildBackupCsv([{ q: '模板问题一' }, { q: '模板问题二' }])
    });

    const rows = await MongoDatasetData.find({ collectionId }).lean();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.indexStatus === DatasetDataIndexStageEnum.index)).toBe(true);

    expect(await MongoDatasetCollection.findById(collectionId).lean()).toHaveProperty(
      'training.usageId'
    );
  });

  /** 普通 rawText 分块同样统一先落库再更新索引。 */
  it('pre-creates data for plain rawText chunk collections as well', async () => {
    const { collectionId } = await insertCollection({
      trainingType: DatasetCollectionDataProcessModeEnum.chunk,
      name: 'plain-chunk.md',
      rawText: '普通文本导入，同样走统一的先落库再更新索引路径。'
    });

    const rows = await MongoDatasetData.find({ collectionId }).lean();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.indexStatus === DatasetDataIndexStageEnum.index)).toBe(true);

    expect(await MongoDatasetCollection.findById(collectionId).lean()).toHaveProperty(
      'training.usageId'
    );
  });

  /** 备份携带的自定义索引必须活到索引完成，一条不少。 */
  const redisUrl = process.env.FASTGPT_TEST_REDIS_URL;
  it.skipIf(!redisUrl)('preserves backup custom indexes through the vector stage', async () => {
    if (!redisUrl) throw new Error('Dedicated Redis is required');
    await closeRedisRuntime();
    configureRedisRuntime({ redisUrl });
    vi.mocked(bullMQ.getQueue).mockRestore();
    vi.mocked(bullMQ.getWorker).mockRestore();
    try {
      const { collectionId } = await insertCollection({
        trainingType: DatasetCollectionDataProcessModeEnum.backup,
        name: 'backup-indexes.csv',
        rawText: buildBackupCsv([
          { q: '带索引的问题一', index: '补充索引甲' },
          { q: '带索引的问题二', index: '补充索引乙' }
        ])
      });
      await initDatasetTrainingWorker();
      await vi.waitFor(
        async () => {
          const rows = await MongoDatasetData.find({ collectionId }).lean();
          expect(rows).toHaveLength(2);
          expect(rows.every(({ indexStatus }) => indexStatus === undefined)).toBe(true);
          expect(rows.flatMap(({ indexes }) => indexes.map(({ text }) => text))).toEqual(
            expect.arrayContaining(['补充索引甲', '补充索引乙'])
          );
        },
        { timeout: 10_000 }
      );
    } finally {
      await closeRedisRuntime();
    }
  });
});
