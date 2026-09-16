/**
 * 测量脚手架（无断言）：在真实内存 Mongo 上跑真实创建路径，输出分段耗时与落库算子数。
 *
 * 只在 MEASURE_CREATE_PERF=1 时执行，默认整文件跳过（不进 CI）。
 * 被替换的**非测量对象**只有三类：
 * - provider（getApiDatasetRequest）：真实延迟不可控，遍历段只计 listFiles 调用次数
 * - 知识库模型解析（dataset/model）：纯内存查表，非 I/O
 * - checkDatasetIndexLimit：套餐初始化依赖全局配置无法在测试环境走通；
 *   它内部那次 MongoTeamSub.find 由 measurePrimitives 单独微测量后补齐
 */
import { beforeAll, describe, it, vi } from 'vitest';

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

vi.mock('@fastgpt/service/core/ai/model', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // getModelHandle 要读模型目录（依赖全局配置），测量无关，直接给定句柄
  getModelHandle: async () => ({
    getLLMModelData: () => ({
      modelId: 'measure-agent-model',
      model: 'measure-agent-model',
      maxToken: 8000,
      config: {}
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
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoTeamSub } from '@fastgpt/service/support/wallet/sub/schema';
import { createApiDatasetCollection } from '@/pages/api/core/dataset/collection/create/apiCollectionV2';

/**
 * 已知会被真实路径调用的落库算子，用来实证「每次写入带多少行」。
 * file 批量路径用 insertMany（一次带 N 行），folder 仍逐层 create。
 */
const opCounts = { collectionCreate: 0, collectionInsertMany: 0, trainingCreate: 0 };

const originalCollectionCreate = MongoDatasetCollection.create.bind(MongoDatasetCollection);
const originalCollectionInsertMany = MongoDatasetCollection.insertMany.bind(MongoDatasetCollection);
const originalTrainingCreate = MongoDatasetTraining.create.bind(MongoDatasetTraining);

/** 4 层结构：哨兵 -> L1 -> L2 -> L3 -> 文件 */
type Shape = { l1: number; l2: number; l3: number; filesPerLeaf: number };

const serverItem = (id: string, type: 'file' | 'folder') => ({
  id,
  rawId: id,
  name: id,
  type,
  hasChild: type === 'folder'
});

const buildServerTree = ({ l1, l2, l3, filesPerLeaf }: Shape) => {
  const tree: Record<string, ReturnType<typeof serverItem>[]> = { ROOT: [] };
  let fileSeq = 0;

  for (let a = 0; a < l1; a++) {
    const idA = `L1-${a}`;
    tree.ROOT.push(serverItem(idA, 'folder'));
    tree[idA] = [];

    for (let b = 0; b < l2; b++) {
      const idB = `${idA}/L2-${b}`;
      tree[idA].push(serverItem(idB, 'folder'));
      tree[idB] = [];

      for (let c = 0; c < l3; c++) {
        const idC = `${idB}/L3-${c}`;
        tree[idB].push(serverItem(idC, 'folder'));
        tree[idC] = [];

        for (let f = 0; f < filesPerLeaf; f++) {
          tree[idC].push(serverItem(`F-${fileSeq++}`, 'file'));
        }
      }
    }
  }

  return tree;
};

const countFolders = ({ l1, l2, l3 }: Shape) => l1 + l1 * l2 + l1 * l2 * l3;

const runCreate = async (shape: Shape) => {
  const tree = buildServerTree(shape);
  mockState.listFilesCalls = 0;
  mockState.logged.length = 0;
  opCounts.collectionCreate = 0;
  opCounts.collectionInsertMany = 0;
  opCounts.trainingCreate = 0;
  mockState.listFiles.mockImplementation(async ({ parentId }: any) => {
    mockState.listFilesCalls++;
    return tree[parentId ?? 'ROOT'] ?? [];
  });

  const teamId = String(new Types.ObjectId());
  const startedAt = Date.now();
  const result = await createApiDatasetCollection({
    datasetId: String(new Types.ObjectId()),
    apiFiles: [{ ...serverItem(RootCollectionId, 'folder'), name: 'root' }] as any,
    parentId: undefined,
    customPdfParse: false,
    trainingType: 'chunk',
    teamId,
    tmbId: String(new Types.ObjectId()),
    dataset: {
      _id: new Types.ObjectId(),
      teamId,
      apiDatasetServer: { apiServer: { basePath: 'ROOT' } },
      permission: {},
      chunkSettings: {}
    } as any
  } as any);
  const wallMs = Date.now() - startedAt;

  const files = shape.l1 * shape.l2 * shape.l3 * shape.filesPerLeaf;

  return {
    files,
    folders: countFolders(shape),
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
    vi.spyOn(MongoDatasetTraining, 'create').mockImplementation(((...args: any[]) => {
      opCounts.trainingCreate++;
      return (originalTrainingCreate as any)(...args);
    }) as any);
  });

  it('输出分段耗时与算子数', async () => {
    const shape = shapeFromEnv();
    const primitives = await measurePrimitives();
    const run = await runCreate(shape);

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
