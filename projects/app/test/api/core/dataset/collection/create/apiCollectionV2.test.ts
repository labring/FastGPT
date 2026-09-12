import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { CreateApiCollectionV2ResponseSchema } from '@fastgpt/global/openapi/core/dataset/collection/createApi';

const {
  mockListFiles,
  mockCreateCollectionAndInsertData,
  mockBulkInsertCollections,
  mockBulkUpdateCollectionsParent,
  mockCollectionFind,
  mockMongoSessionRun,
  mockLoggerWarn,
  objectIdState,
  MockObjectId
} = vi.hoisted(() => {
  // 真实 ObjectId 只接受 24 位 hex，用例里会出现 'KB_FOLDER' 这类占位父级；
  // 用自增字符串替身并让 toString() 可预测，便于断言 Map 查表结果
  const objectIdState = { counter: 0 };
  class MockObjectId {
    value: string;
    constructor(v?: string) {
      this.value = v ?? `mock-oid-${++objectIdState.counter}`;
    }
    toString() {
      return this.value;
    }
  }
  return {
    mockListFiles: vi.fn(),
    mockCreateCollectionAndInsertData: vi.fn(),
    mockBulkInsertCollections: vi.fn(),
    mockBulkUpdateCollectionsParent: vi.fn(),
    mockCollectionFind: vi.fn(),
    mockMongoSessionRun: vi.fn(),
    mockLoggerWarn: vi.fn(),
    objectIdState,
    MockObjectId
  };
});

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  LogCategories: { MODULE: { DATASET: 'dataset' } },
  getLogger: () => ({ info: vi.fn(), warn: mockLoggerWarn, error: vi.fn() })
}));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: { find: mockCollectionFind }
}));

vi.mock('@fastgpt/service/common/mongo', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Types: { ObjectId: MockObjectId }
}));

vi.mock('@fastgpt/service/core/dataset/apiDataset', () => ({
  getApiDatasetRequest: vi.fn(async () => ({
    listFiles: mockListFiles
  }))
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mockMongoSessionRun
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', () => ({
  createCollectionAndInsertData: mockCreateCollectionAndInsertData,
  bulkInsertCollections: mockBulkInsertCollections,
  bulkUpdateCollectionsParent: mockBulkUpdateCollectionsParent,
  API_FILE_FILE_BATCH_SIZE: 200
}));

import { createApiDatasetCollection } from '@/pages/api/core/dataset/collection/create/apiCollectionV2';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';

/** 构造 server 端节点（APIFileItemType 的最小可用形状） */
const apiFile = (id: string, type: 'file' | 'folder', hasChild = false, name = id): any => ({
  id,
  rawId: id,
  parentId: '',
  name,
  type,
  hasChild,
  updateTime: new Date(),
  createTime: new Date()
});

/** 用 parentId -> children 映射驱动 listFiles */
const setServerTree = (tree: Record<string, any[]>) => {
  mockListFiles.mockImplementation(async ({ parentId }: any) => tree[parentId] ?? []);
};

const createDataset = (apiDatasetServer: any = {}) =>
  ({
    _id: 'dataset-id',
    teamId: 'team-id',
    apiDatasetServer,
    permission: {}
  }) as any;

const call = (overrides: any = {}) =>
  createApiDatasetCollection({
    datasetId: 'dataset-id',
    apiFiles: [],
    customPdfParse: false,
    teamId: 'team-id',
    tmbId: 'tmb-id',
    dataset: createDataset(),
    ...overrides
  } as any);

const folderDocs = () =>
  mockBulkInsertCollections.mock.calls.flatMap((c: any[]) => (c[0] as any).docs);
const findFolder = (apiFileId: string) =>
  folderDocs().find((doc: any) => doc.apiFileId === apiFileId);
const createdFileParams = () =>
  mockCreateCollectionAndInsertData.mock.calls.map(
    (c: any[]) => (c[0] as any).createCollectionParams
  );
const correctionUpdates = () =>
  (mockBulkUpdateCollectionsParent.mock.calls[0]?.[0] as any)?.updates ?? [];

describe('createApiDatasetCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    objectIdState.counter = 0;
    mockListFiles.mockResolvedValue([]);
    mockCollectionFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockBulkInsertCollections.mockImplementation(async ({ docs }: any) => ({
      successApiFileIds: docs.map((d: any) => d.apiFileId),
      failedApiFileIds: []
    }));
    mockBulkUpdateCollectionsParent.mockImplementation(async ({ updates }: any) => ({
      successIds: updates.map((u: any) => u._id),
      failedIds: []
    }));
    mockMongoSessionRun.mockImplementation((fn: any) => fn('session'));
    mockCreateCollectionAndInsertData.mockResolvedValue({
      collectionId: 'c',
      results: { insertLen: 0 }
    });
  });

  it('should use dingtalk rootNodeId when importing root folder recursively', async () => {
    mockListFiles.mockResolvedValueOnce([apiFile('doc-1', 'file', false, 'Doc 1')]);

    const dataset = createDataset({
      dingtalkServer: {
        appKey: 'ding-app',
        userId: 'user-id',
        rootNodeId: 'dingtalk-root'
      }
    });

    await createApiDatasetCollection({
      datasetId: 'dataset-id',
      apiFiles: [apiFile(RootCollectionId, 'folder', true, 'ROOT_FOLDER')],
      customPdfParse: false,
      trainingType: 'chunk',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      dataset
    } as any);

    expect(getApiDatasetRequest).toHaveBeenCalledWith(dataset.apiDatasetServer);
    expect(mockListFiles).toHaveBeenCalledWith({
      parentId: 'dingtalk-root'
    });

    // 根哨兵 folder 被创建为骨架的一部分
    expect(folderDocs()).toEqual([
      expect.objectContaining({ apiFileId: RootCollectionId, type: 'folder' })
    ]);

    expect(mockCreateCollectionAndInsertData).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset,
        createCollectionParams: expect.objectContaining({
          apiFileId: 'doc-1',
          type: 'apiFile'
        }),
        session: 'session'
      })
    );
  });

  it('T3-1 四层层级：folder 逐层写 parentId，file 落在 L3 之下', async () => {
    setServerTree({
      l1: [apiFile('l2', 'folder', true)],
      l2: [apiFile('l3', 'folder', true)],
      l3: [apiFile('l4', 'file')]
    });

    const result = await call({
      apiFiles: [apiFile('l1', 'folder', true)],
      parentId: 'KB_FOLDER'
    });

    // ① 3 个 folder 写入，父级逐层正确
    expect(folderDocs()).toHaveLength(3);
    expect(String(findFolder('l2').parentId)).toBe(String(findFolder('l1')._id));
    expect(String(findFolder('l3').parentId)).toBe(String(findFolder('l2')._id));
    // ④ apiFileParentId 为直接 server 父级
    expect(findFolder('l2').apiFileParentId).toBe('l1');
    expect(findFolder('l3').apiFileParentId).toBe('l2');
    // ⑤ 本次选中的最外层 folder 的 parentId 取自请求体
    expect(String(findFolder('l1').parentId)).toBe('KB_FOLDER');

    // ②③ file 的 parentId 是 L3 的 _id，apiFileParentId 是 'l3'
    expect(createdFileParams()).toHaveLength(1);
    expect(createdFileParams()[0].apiFileId).toBe('l4');
    expect(createdFileParams()[0].parentId).toBe(String(findFolder('l3')._id));
    expect(createdFileParams()[0].apiFileParentId).toBe('l3');

    expect(result).toEqual({ successCount: 4, failedCount: 0 });
  });

  it('T3-2 中间层 folder 已存在：不重复创建，子级挂到已存在 _id', async () => {
    setServerTree({
      l1: [apiFile('l2', 'folder', true)],
      l2: [apiFile('l3', 'folder', true)],
      l3: [apiFile('l4', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([
          { _id: 'existing-l2-id', apiFileId: 'l2', apiFileParentId: null, parentId: null }
        ])
    });

    await call({ apiFiles: [apiFile('l1', 'folder', true)], parentId: 'KB_ROOT' });

    expect(findFolder('l2')).toBeUndefined();
    expect(String(findFolder('l3').parentId)).toBe('existing-l2-id');
    expect(createdFileParams()[0].parentId).toBe(String(findFolder('l3')._id));
  });

  it('T3-4 单文件导入：parentId 取请求体', async () => {
    await call({ apiFiles: [apiFile('f1', 'file')], parentId: 'KB_SELECTED' });

    expect(createdFileParams()).toHaveLength(1);
    expect(createdFileParams()[0].apiFileId).toBe('f1');
    expect(createdFileParams()[0].parentId).toBe('KB_SELECTED');
    expect(createdFileParams()[0].apiFileParentId).toBeUndefined();
  });

  it('T3-5 请求体 parentId 被 server 层级覆盖', async () => {
    setServerTree({
      l1: [apiFile('l2', 'folder', true)],
      l2: [apiFile('l3', 'folder', true)],
      l3: [apiFile('l4', 'file')]
    });

    await call({ apiFiles: [apiFile('l1', 'folder', true)], parentId: 'KB_FOLDER' });

    expect(createdFileParams()[0].parentId).toBe(String(findFolder('l3')._id));
    expect(createdFileParams()[0].parentId).not.toBe('KB_FOLDER');
  });

  it('T3-6 渐进导入收敛：后导入祖先时校正已有子树', async () => {
    setServerTree({
      b: [apiFile('c', 'folder', true)],
      c: [apiFile('d', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'C', apiFileId: 'c', apiFileParentId: null, parentId: null },
        { _id: 'D', apiFileId: 'd', apiFileParentId: 'c', parentId: 'C' }
      ])
    });

    await call({ apiFiles: [apiFile('b', 'folder', true)] });

    const b = findFolder('b');
    expect(b).toBeDefined();
    // 不重复创建 c / d
    expect(findFolder('c')).toBeUndefined();
    expect(mockCreateCollectionAndInsertData).not.toHaveBeenCalled();

    // 校正条目：c 重挂到 b，d 已经正确所以不出现
    const updates = correctionUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0]._id).toBe('C');
    expect(String(updates[0].parentId)).toBe(String(b._id));
    expect(updates[0].apiFileParentId).toBe('b');
    expect(updates.find((u: any) => u._id === 'D')).toBeUndefined();
  });

  it('T3-7 重复导入幂等：无新增、校正为空、计数为 0', async () => {
    setServerTree({
      l1: [apiFile('l2', 'folder', true)],
      l2: [apiFile('l3', 'folder', true)],
      l3: [apiFile('l4', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'OID_L1', apiFileId: 'l1', apiFileParentId: null, parentId: null },
        { _id: 'OID_L2', apiFileId: 'l2', apiFileParentId: 'l1', parentId: 'OID_L1' },
        { _id: 'OID_L3', apiFileId: 'l3', apiFileParentId: 'l2', parentId: 'OID_L2' },
        { _id: 'OID_L4', apiFileId: 'l4', apiFileParentId: 'l3', parentId: 'OID_L3' }
      ])
    });

    const result = await call({ apiFiles: [apiFile('l1', 'folder', true)] });

    expect(folderDocs()).toHaveLength(0);
    expect(mockCreateCollectionAndInsertData).not.toHaveBeenCalled();
    expect(mockBulkUpdateCollectionsParent).toHaveBeenCalledWith(
      expect.objectContaining({ updates: [] })
    );
    expect(result).toEqual({ successCount: 0, failedCount: 0 });
    // 校正未失败：不得出现校正失败告警（防止把 warn 写成无条件）
    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      'Create api file collection parent update failed',
      expect.anything()
    );
  });

  it('T3-8 550 个平铺文件按 200 分批事务', async () => {
    const files = Array.from({ length: 550 }, (_, i) => apiFile(`f${i}`, 'file'));

    const batchSizes: number[] = [];
    mockMongoSessionRun.mockImplementation(async (fn: any) => {
      const before = mockCreateCollectionAndInsertData.mock.calls.length;
      const result = await fn('session');
      batchSizes.push(mockCreateCollectionAndInsertData.mock.calls.length - before);
      return result;
    });

    await call({ apiFiles: files });

    expect(mockMongoSessionRun).toHaveBeenCalledTimes(3);
    expect(batchSizes).toEqual([200, 200, 150]);
    expect(batchSizes.every((size) => size <= 200)).toBe(true);
  });

  it('T3-9 1200 个同层 folder 一次 bulkInsertCollections 交付', async () => {
    const folders = Array.from({ length: 1200 }, (_, i) => apiFile(`d${i}`, 'folder'));

    await call({ apiFiles: folders });

    expect(mockBulkInsertCollections).toHaveBeenCalledTimes(1);
    expect((mockBulkInsertCollections.mock.calls[0][0] as any).docs).toHaveLength(1200);
  });

  it('T3-10 顶层节点无 server 父级：parentId 取请求体', async () => {
    await call({ apiFiles: [apiFile('top', 'folder')], parentId: 'KB_ROOT' });

    expect(folderDocs()).toHaveLength(1);
    expect(String(folderDocs()[0].parentId)).toBe('KB_ROOT');
  });

  it('T3-11 父级写入失败：整棵子树跳过且不回退到请求体 parentId', async () => {
    setServerTree({
      l1: [apiFile('l2', 'folder', true)],
      l2: [apiFile('l3', 'folder', true)],
      l3: [apiFile('l4', 'file')]
    });
    mockBulkInsertCollections.mockImplementation(async ({ docs }: any) => {
      const failed = docs.filter((doc: any) => doc.apiFileId === 'l2');
      if (failed.length) {
        return { successApiFileIds: [], failedApiFileIds: ['l2'] };
      }
      return { successApiFileIds: docs.map((doc: any) => doc.apiFileId), failedApiFileIds: [] };
    });

    const result = await call({
      apiFiles: [apiFile('l1', 'folder', true)],
      parentId: 'KB_FOLDER'
    });

    // L2 失败 -> L3 与 file 均不创建，绝不回退到 'KB_FOLDER'
    expect(mockCreateCollectionAndInsertData).not.toHaveBeenCalled();
    expect(findFolder('l3')).toBeUndefined();
    // 1 个成功（l1）+ 失败 3（l2、l3、l4 整棵）
    expect(result).toEqual({ successCount: 1, failedCount: 3 });
  });

  it('T3-12 file 批事务失败：仅该批计入失败，其余批次继续', async () => {
    const files = Array.from({ length: 550 }, (_, i) => apiFile(`f${i}`, 'file'));

    // 第 2 个事务内的 createCollectionAndInsertData 抛错，使该批整体失败
    let sessionRuns = 0;
    let failingRun = false;
    mockMongoSessionRun.mockImplementation(async (fn: any) => {
      sessionRuns++;
      failingRun = sessionRuns === 2;
      try {
        return await fn('session');
      } finally {
        failingRun = false;
      }
    });
    mockCreateCollectionAndInsertData.mockImplementation(async () => {
      if (failingRun) throw new Error('batch-2 failed');
      return { collectionId: 'c', results: { insertLen: 0 } };
    });

    const result = await call({ apiFiles: files });

    expect(result).toEqual({ successCount: 350, failedCount: 200 });
    // 文件批事务失败必须留下服务端信号，否则整批静默丢失
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Create api file collection batch failed',
      expect.objectContaining({ datasetId: 'dataset-id', batchSize: 200 })
    );
  });

  it('T3-13 校正失败不阻断后续 file 批次', async () => {
    setServerTree({
      p: [apiFile('c', 'folder', true)],
      c: [apiFile('f', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([{ _id: 'C', apiFileId: 'c', apiFileParentId: null, parentId: null }])
    });
    mockBulkUpdateCollectionsParent.mockResolvedValue({ successIds: [], failedIds: ['C'] });

    const result = await call({ apiFiles: [apiFile('p', 'folder', true)] });

    expect(correctionUpdates()).toHaveLength(1);
    expect(result.failedCount).toBe(1);
    expect(mockCreateCollectionAndInsertData).toHaveBeenCalled();
    // 校正失败必须记 WARN（设计文档 §3.2.2.1 步骤 9 / §3.2.4），否则 40k 规模下无人可查
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Create api file collection parent update failed',
      expect.objectContaining({ datasetId: 'dataset-id', failedCount: 1 })
    );
  });

  it('T3-14 空输入：不写任何数据', async () => {
    const result = await call({ apiFiles: [] });

    expect(mockBulkInsertCollections).not.toHaveBeenCalled();
    expect(mockCreateCollectionAndInsertData).not.toHaveBeenCalled();
    expect(result).toEqual({ successCount: 0, failedCount: 0 });
  });

  it('T3-15 拉取失败：接口 reject 且无任何写入', async () => {
    mockListFiles.mockRejectedValue(new Error('server down'));

    await expect(call({ apiFiles: [apiFile('l1', 'folder', true)] })).rejects.toThrow(
      'server down'
    );

    expect(mockBulkInsertCollections).not.toHaveBeenCalled();
    expect(mockCreateCollectionAndInsertData).not.toHaveBeenCalled();
  });

  it('T3-16 响应契约：{successCount, failedCount} 可被 schema 解析', async () => {
    const result = await call({ apiFiles: [apiFile('f1', 'file')], parentId: 'KB_ROOT' });

    expect(typeof result.successCount).toBe('number');
    expect(typeof result.failedCount).toBe('number');
    expect(() => CreateApiCollectionV2ResponseSchema.parse(result)).not.toThrow();
  });

  it('T3-17 folder 批内部分落库：落库分支的子级照常挂载，失败分支的子树跳过', async () => {
    setServerTree({
      top: [apiFile('land', 'folder', true), apiFile('fail', 'folder', true)],
      land: [apiFile('land-child', 'folder', true)],
      fail: [apiFile('fail-child', 'folder', true)],
      'land-child': [apiFile('land-file', 'file')],
      'fail-child': [apiFile('fail-file', 'file')]
    });
    // T2 的部分落库：同一批里 land 成功、fail 失败（recovery 重查后的 split）
    mockBulkInsertCollections.mockImplementation(async ({ docs }: any) => {
      const ids = docs.map((doc: any) => doc.apiFileId);
      if (ids.includes('fail')) {
        return { successApiFileIds: ['land'], failedApiFileIds: ['fail'] };
      }
      return { successApiFileIds: ids, failedApiFileIds: [] };
    });

    const result = await call({ apiFiles: [apiFile('top', 'folder', true)] });

    // 落库分支：子 folder 与 file 正常挂到 land 之下
    const land = findFolder('land');
    expect(land).toBeDefined();
    expect(String(findFolder('land-child').parentId)).toBe(String(land._id));
    expect(createdFileParams()).toHaveLength(1);
    expect(createdFileParams()[0].apiFileId).toBe('land-file');
    expect(createdFileParams()[0].parentId).toBe(String(findFolder('land-child')._id));

    // 失败分支：fail-child 连提交都没有（父级未落库 -> 整棵跳过），fail-file 也不创建
    expect(findFolder('fail-child')).toBeUndefined();
    expect(createdFileParams().find((p: any) => p.apiFileId === 'fail-file')).toBeUndefined();

    // top + land + land-child + land-file 成功；fail + fail-child + fail-file 失败
    expect(result).toEqual({ successCount: 4, failedCount: 3 });
  });

  it('T3-18 已存在节点的新父级本轮失败：保留原父级（不重挂），同批落库的父级仍校正', async () => {
    setServerTree({
      p: [apiFile('q', 'folder', true), apiFile('n', 'folder', true)],
      q: [apiFile('ex-q', 'file')],
      n: [apiFile('ex-n', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'EXQ', apiFileId: 'ex-q', apiFileParentId: 'q', parentId: 'STALE' },
        { _id: 'EXN', apiFileId: 'ex-n', apiFileParentId: null, parentId: 'STALE' }
      ])
    });
    // 同层 folder 批：n 落库、q 失败
    mockBulkInsertCollections.mockImplementation(async ({ docs }: any) => {
      const ids = docs.map((doc: any) => doc.apiFileId);
      if (ids.includes('q')) {
        return { successApiFileIds: ['n'], failedApiFileIds: ['q'] };
      }
      return { successApiFileIds: ids, failedApiFileIds: [] };
    });

    const result = await call({ apiFiles: [apiFile('p', 'folder', true)] });

    // q 未落库 -> ex-q 的校正被跳过，保留原父级；不得凭空重挂
    const updates = correctionUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0]._id).toBe('EXN');
    expect(String(updates[0].parentId)).toBe(String(findFolder('n')._id));
    expect(updates[0].apiFileParentId).toBe('n');
    expect(updates.find((u: any) => u._id === 'EXQ')).toBeUndefined();

    // 已存在节点不重建
    expect(mockCreateCollectionAndInsertData).not.toHaveBeenCalled();
    // p + n 成功；q 失败
    expect(result).toEqual({ successCount: 2, failedCount: 1 });
  });

  it('T3-19 校正失败日志有界：只采样前 10 条失败 id', async () => {
    const fileIds = Array.from({ length: 12 }, (_, i) => `f${i}`);
    setServerTree({ p: fileIds.map((id) => apiFile(id, 'file')) });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue(
        fileIds.map((apiFileId, i) => ({
          _id: `EX${i}`,
          apiFileId,
          apiFileParentId: 'p',
          parentId: 'STALE'
        }))
      )
    });
    mockBulkUpdateCollectionsParent.mockImplementation(async ({ updates }: any) => ({
      successIds: [],
      failedIds: updates.map((u: any) => u._id)
    }));

    const result = await call({ apiFiles: [apiFile('p', 'folder', true)] });

    expect(correctionUpdates()).toHaveLength(12);
    expect(result.failedCount).toBe(12);
    // 40k 规模下 failedIds 可能上万条，日志只带 count + 前 10 条样本
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Create api file collection parent update failed',
      expect.objectContaining({
        failedCount: 12,
        failedIdsSample: ['EX0', 'EX1', 'EX2', 'EX3', 'EX4', 'EX5', 'EX6', 'EX7', 'EX8', 'EX9']
      })
    );
  });
});
