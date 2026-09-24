import { getModelTestDefaults, addModelTestModel } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';
import { mockVectorInsert, resetVectorMocks } from '@test/mocks/common/vector';
import { createMockVectorsResponse, mockGetVectors } from '@test/mocks/core/ai/embedding';
import { countPromptTokensInWorker } from '@fastgpt/service/worker/countGptMessagesTokens/count';
import { serviceEnv } from '@fastgpt/service/env';

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
vi.mock('@fastgpt/service/core/ai/model', async (importOriginal) =>
  importOriginal<typeof import('@fastgpt/service/core/ai/model')>()
);
vi.mock('@fastgpt/service/support/permission/teamLimit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/permission/teamLimit')>()),
  checkDatasetIndexLimit: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/wallet/usage/controller')>()),
  createTrainingUsage: vi.fn().mockResolvedValue({ usageId: 'test-usage-id' })
}));
vi.mock('@/service/core/dataset/queues/utils', () => ({
  checkTeamAiPointsAndLock: vi.fn().mockResolvedValue(true)
}));

import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { generateVector } from '@/service/core/dataset/queues/generateVector';

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

/**
 * 把向量队列排空。
 *
 * 队列的领取条件是全局的（不带数据集过滤），且要求任务 lockTime 早于 3 分钟；生产由每分钟的
 * cron 反复驱动。测试里只调用一次时，任何一次「已领取但未处理完」都会让任务在 3 分钟内不可再
 * 领取，数据停留在待索引状态。这里按生产的重试语义重开锁并重试，失败时把任务错误抛出来。
 */
const drainVectorQueue = async (collectionId: string) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await generateVector();

    if ((await MongoDatasetTraining.countDocuments({ collectionId })) === 0) return;

    await MongoDatasetTraining.updateMany(
      { collectionId },
      { $set: { lockTime: new Date('2000-01-01') } }
    );
  }

  const stuck = await MongoDatasetTraining.find({ collectionId }).lean();
  throw new Error(
    `向量队列未排空，剩余 ${stuck.length} 条任务：` +
      JSON.stringify(
        stuck.map((task) => ({
          mode: task.mode,
          retryCount: task.retryCount,
          errorMsg: task.errorMsg
        }))
      )
  );
};

/**
 * 断言数据全部完成索引；失败时把数据与任务的实际状态带出来。
 *
 * 该断言此前只报 `expected false to be true`，无法区分「路由走错」与「队列没跑完」，
 * 因此把可观测状态一并抛出，便于定位。
 */
const expectAllIndexed = async ({
  collectionId,
  rows
}: {
  collectionId: string;
  rows: { _id: unknown; indexStatus?: DatasetDataIndexStatusEnum; indexes?: unknown[] }[];
}) => {
  const notIndexed = rows.filter((row) => row.indexStatus !== DatasetDataIndexStatusEnum.indexed);
  if (notIndexed.length === 0) return;

  const tasks = await MongoDatasetTraining.find({ collectionId }).lean();
  throw new Error(
    `存在未完成索引的数据：${JSON.stringify(
      notIndexed.map((row) => ({
        id: String(row._id),
        indexStatus: row.indexStatus ?? null,
        indexCount: (row.indexes ?? []).length
      }))
    )}；剩余训练任务：${JSON.stringify(
      tasks.map((task) => ({
        mode: task.mode,
        dataId: task.dataId ?? null,
        retryCount: task.retryCount,
        errorMsg: task.errorMsg ?? null
      }))
    )}`
  );
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
    global.vectorQueueLen = 0;
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
    expect(rows.every((row) => row.indexStatus === DatasetDataIndexStatusEnum.parsed)).toBe(true);
    // 待索引数据尚无向量，索引数组应为空。
    expect(rows.every((row) => (row.indexes ?? []).length === 0)).toBe(true);

    const tasks = await MongoDatasetTraining.find({ collectionId }).lean();
    expect(tasks).toHaveLength(2);
    expect(tasks.every((task) => Boolean(task.dataId))).toBe(true);

    // 每条任务指向一条已存在的预落库数据，不能有悬空 dataId。
    const rowIds = new Set(rows.map((row) => String(row._id)));
    expect(tasks.every((task) => rowIds.has(String(task.dataId)))).toBe(true);
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
    expect(rows.every((row) => row.indexStatus === DatasetDataIndexStatusEnum.parsed)).toBe(true);

    const tasks = await MongoDatasetTraining.find({ collectionId }).lean();
    expect(tasks).toHaveLength(2);
    expect(tasks.every((task) => Boolean(task.dataId))).toBe(true);
  });

  /** 集合同步等其它 rawText 调用方继续走原有创建路径，不被本次改造波及。 */
  it('keeps the legacy create path for other rawText callers', async () => {
    const { collectionId } = await insertCollection({
      trainingType: DatasetCollectionDataProcessModeEnum.chunk,
      name: 'plain-chunk.md',
      rawText: '普通文本导入，走既有的先索引后创建路径。'
    });

    const rows = await MongoDatasetData.find({ collectionId }).lean();
    expect(rows).toHaveLength(0);

    const tasks = await MongoDatasetTraining.find({ collectionId }).lean();
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => !task.dataId)).toBe(true);
  });

  /** 备份携带的自定义索引必须活到索引完成，一条不少。 */
  it('preserves backup custom indexes through the vector stage', async () => {
    const { collectionId } = await insertCollection({
      trainingType: DatasetCollectionDataProcessModeEnum.backup,
      name: 'backup-indexes.csv',
      rawText: buildBackupCsv([
        { q: '带索引的问题一', index: '补充索引甲' },
        { q: '带索引的问题二', index: '补充索引乙' }
      ])
    });

    await drainVectorQueue(collectionId);

    const rows = await MongoDatasetData.find({ collectionId }).lean();
    expect(rows).toHaveLength(2);
    await expectAllIndexed({ collectionId, rows });

    const indexTexts = rows.flatMap((row) => (row.indexes ?? []).map((index) => index.text));
    expect(indexTexts).toContain('补充索引甲');
    expect(indexTexts).toContain('补充索引乙');
    // 数据行仍是预落库时的同一条，没有新建重复行。
    expect(new Set(rows.map((row) => String(row._id))).size).toBe(2);
    expect(await MongoDatasetTraining.countDocuments({ collectionId })).toBe(0);
  });
});
