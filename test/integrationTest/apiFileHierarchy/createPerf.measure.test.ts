/**
 * 在真实内存 Mongo 上验证 4 万条解析任务的事务耗时，并可选输出完整创建路径的分段耗时。
 *
 * 创建路径与 4 万条队列事务测量仅在 MEASURE_CREATE_PERF=1 时执行。
 * 被替换的**非测量对象**只有三类：
 * - provider（getApiDatasetRequest）：真实延迟不可控，遍历段只计 listFiles 调用次数
 * - 知识库模型解析（dataset/model）：纯内存查表，非 I/O
 * - checkDatasetIndexLimit：套餐初始化依赖全局配置无法在测试环境走通；
 *   它内部那次 MongoTeamSub.find 由 measurePrimitives 单独微测量后补齐
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const deepProxy: any = new Proxy(function () {}, { get: () => deepProxy });
  const logged: Record<string, any>[] = [];
  const logger: any = {
    info: (message: string, payload: Record<string, any>) => logged.push({ message, ...payload }),
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
    child: () => logger
  };
  return {
    listFiles: vi.fn(),
    listFilesCalls: 0,
    logged,
    deepProxy,
    logger
  };
});

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: any) => handler }));

vi.mock('@fastgpt/service/common/logger', () => ({
  LogCategories: mockState.deepProxy,
  getLogger: () => mockState.logger,
  configureLogger: vi.fn(),
  disposeLogger: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // getTeamModelHandle 要读模型目录（依赖全局配置），测量无关，直接给定句柄
  getTeamModelHandle: async () => ({
    getLLMModelData: () => ({
      modelId: 'measure-agent-model',
      model: 'measure-agent-model',
      maxToken: 8000,
      config: { maxContext: 8000, maxResponse: 1000 }
    }),
    getEmbeddingModelData: () => ({
      modelId: 'measure-embedding-model',
      model: 'measure-embedding-model',
      config: { defaultToken: 100, maxToken: 100, weight: 0 }
    }),
    getVlmModelData: () => undefined
  })
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: vi.fn(),
  checkTeamDatasetLimit: vi.fn(),
  checkTeamDatasetSyncPermission: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/apiDataset', () => ({
  getApiDatasetRequest: vi.fn(async () => ({
    listFiles: mockState.listFiles,
    getFileContent: vi.fn(),
    getFileRawId: (apiFileId: string) => apiFileId
  }))
}));

// 覆盖 test/mocks 里的全局替身，恢复真实事务（内存副本集支持事务）
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => ({
  ...(await importOriginal<object>())
}));

import { Types } from '@fastgpt/service/common/mongo';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoTeamSub } from '@fastgpt/service/support/wallet/sub/schema';
import { createApiDatasetCollection } from '@fastgpt/service/core/dataset/apiDataset/service';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { pushDatasetToParseQueue } from '@fastgpt/service/core/dataset/training/controller';
import { createRemoteTree, generateRemoteTree } from '@test/fixtures/apiDataset/tree';

/**
 * 已知会被真实路径调用的落库算子，用来实证「每次写入带多少行」。
 * file 与 folder 路径都用 insertMany，并分别统计实际批次数。
 */
const opCounts = { collectionCreate: 0, collectionInsertMany: 0, trainingInsertMany: 0 };

const originalCollectionCreate = MongoDatasetCollection.create.bind(MongoDatasetCollection);
const originalCollectionInsertMany = MongoDatasetCollection.insertMany.bind(MongoDatasetCollection);
const originalTrainingInsertMany = MongoDatasetTraining.insertMany.bind(MongoDatasetTraining);

/** 4 层结构：哨兵 -> L1 -> L2 -> L3 -> 文件 */
type Shape = { l1: number; l2: number; l3: number; filesPerLeaf: number };

const serverItem = (id: string, type: 'file' | 'folder') => ({
  id,
  rawId: id,
  name: id,
  type,
  hasChild: type === 'folder'
});

const runCreate = async (shape: Shape) => {
  const tree = createRemoteTree(
    generateRemoteTree({
      folderCounts: [shape.l1, shape.l2, shape.l3],
      filesPerLeaf: shape.filesPerLeaf,
      rootKey: 'ROOT'
    })
  );
  mockState.listFilesCalls = 0;
  mockState.logged.length = 0;
  opCounts.collectionCreate = 0;
  opCounts.collectionInsertMany = 0;
  opCounts.trainingInsertMany = 0;
  mockState.listFiles.mockImplementation(async ({ parentId }: any) => {
    mockState.listFilesCalls++;
    return (tree.children.get(parentId ?? 'ROOT') ?? []).map((node) =>
      serverItem(node.key, node.type === 'folder' ? 'folder' : 'file')
    );
  });

  const teamId = String(new Types.ObjectId());
  const tmbId = String(new Types.ObjectId());
  // 创建路径会在事务内锁定权限开关，测量输入必须是真实存在的知识库。
  const dataset = await MongoDataset.create({
    teamId,
    tmbId,
    name: 'Creation measurement',
    type: 'apiDataset',
    apiDatasetServer: { apiServer: { basePath: 'ROOT' } },
    chunkSettings: {}
  });
  const startedAt = Date.now();
  const result = await createApiDatasetCollection({
    datasetId: String(dataset._id),
    apiFiles: [{ ...serverItem(RootCollectionId, 'folder'), name: 'root' }] as any,
    parentId: undefined,
    customPdfParse: false,
    trainingType: 'chunk',
    teamId,
    tmbId,
    dataset: { ...dataset.toObject(), permission: {} } as any
  } as any);
  const wallMs = Date.now() - startedAt;

  const files = shape.l1 * shape.l2 * shape.l3 * shape.filesPerLeaf;

  return {
    files,
    folders: tree.nodes.filter((node) => node.type === 'folder').length - 1,
    wallMs,
    perFileMs: Number((wallMs / files).toFixed(2)),
    result,
    listFilesCalls: mockState.listFilesCalls,
    opCounts: { ...opCounts },
    phase:
      mockState.logged.find((item) => item.message === 'Create api file collection completed') ??
      null
  };
};

/** 微测量：非事务单次 Mongo 往返（用于补齐被 mock 掉的 checkDatasetIndexLimit 内部那次 find） */
const measurePrimitives = async () => {
  const teamId = new Types.ObjectId();
  const rounds = 200;
  const warmupRounds = 50;

  // 预热：首次访问该 collection 会触发建索引/连接，计入平均值会让单次往返虚高
  for (let i = 0; i < warmupRounds; i++) {
    await MongoTeamSub.find({ teamId }).lean();
  }

  const startedAt = Date.now();
  for (let i = 0; i < rounds; i++) {
    await MongoTeamSub.find({ teamId }).lean();
  }
  const totalMs = Date.now() - startedAt;

  return { rounds, totalMs, perOpMs: Number((totalMs / rounds).toFixed(3)) };
};

const shapeFromEnv = (): Shape => ({
  l1: Number(process.env.MEASURE_L1 ?? 2),
  l2: Number(process.env.MEASURE_L2 ?? 3),
  l3: Number(process.env.MEASURE_L3 ?? 5),
  filesPerLeaf: Number(process.env.MEASURE_FILES_PER_LEAF ?? 20)
});

describe.runIf(process.env.MEASURE_CREATE_PERF === '1')('创建路径耗时测量', () => {
  beforeAll(() => {
    vi.spyOn(MongoDatasetCollection, 'create').mockImplementation(((...args: any[]) => {
      opCounts.collectionCreate++;
      return (originalCollectionCreate as any)(...args);
    }) as any);
    vi.spyOn(MongoDatasetCollection, 'insertMany').mockImplementation(((...args: any[]) => {
      opCounts.collectionInsertMany++;
      return (originalCollectionInsertMany as any)(...args);
    }) as any);
    vi.spyOn(MongoDatasetTraining, 'insertMany').mockImplementation(((...args: any[]) => {
      opCounts.trainingInsertMany++;
      return (originalTrainingInsertMany as any)(...args);
    }) as any);
  });

  it('输出分段耗时与算子数', async () => {
    const shape = shapeFromEnv();
    const primitives = await measurePrimitives();
    const run = await runCreate(shape);

    expect(run.opCounts.trainingInsertMany).toBe(1);

    // 每次测量输出一行，便于对比不同规模
    console.log(
      '\n[MEASURE] ' +
        JSON.stringify(
          {
            shape,
            files: run.files,
            folders: run.folders,
            wallMs: run.wallMs,
            perFileMs: run.perFileMs,
            listFilesCalls: run.listFilesCalls,
            result: run.result,
            opCounts: run.opCounts,
            phase: run.phase,
            primitives
          },
          null,
          2
        )
    );
  }, 900000);
});

describe.runIf(process.env.MEASURE_CREATE_PERF === '1')('解析队列 4 万规模事务性能', () => {
  it('在默认 60 秒事务期限内用一次 insertMany 写入 4 万条任务', async () => {
    const teamId = String(new Types.ObjectId());
    const datasetId = String(new Types.ObjectId());
    const collectionIds = Array.from({ length: 40_000 }, () => String(new Types.ObjectId()));
    const startedAt = Date.now();

    await mongoSessionRun((session) =>
      pushDatasetToParseQueue({
        teamId,
        tmbId: String(new Types.ObjectId()),
        datasetId,
        collectionId: collectionIds,
        billId: String(new Types.ObjectId()),
        session
      })
    );

    const durationMs = Date.now() - startedAt;
    expect(durationMs).toBeLessThan(60_000);
    await expect(MongoDatasetTraining.countDocuments({ teamId, datasetId })).resolves.toBe(40_000);
  }, 70_000);
});
