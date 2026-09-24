import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { CreateApiCollectionV2ResponseSchema } from '@fastgpt/global/openapi/core/dataset/collection/createApi';

const {
  mockListFiles,
  mockCreateApiFileCollectionsBatch,
  mockBulkInsertFolderCollections,
  mockBulkMoveCollectionsParent,
  mockCollectionFind,
  mockMongoSessionRun,
  mockLoggerWarn,
  objectIdState,
  MockObjectId
} = vi.hoisted(() => {
  // 真实 ObjectId 只接受 24 位 hex，而用例里用 'C'/'D' 这类短串做本地 collection 的 _id；
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
    mockCreateApiFileCollectionsBatch: vi.fn(),
    mockBulkInsertFolderCollections: vi.fn(),
    mockBulkMoveCollectionsParent: vi.fn(),
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
  createApiFileCollectionsBatch: mockCreateApiFileCollectionsBatch,
  bulkInsertFolderCollections: mockBulkInsertFolderCollections,
  bulkMoveCollectionsParent: mockBulkMoveCollectionsParent,
  // 整批事务的提交上限；数值本身由 controller 的单测覆盖，这里只要求被显式传入
  API_FILE_FILE_COMMIT_TIMEOUT_MS: 5 * 60 * 1000
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
  mockBulkInsertFolderCollections.mock.calls.flatMap((c: any[]) => (c[0] as any).docs);
const findFolder = (apiFileId: string) =>
  folderDocs().find((doc: any) => doc.apiFileId === apiFileId);
/** 把整批调用展开成「每文件一份参数」，保留原有逐文件断言口径 */
const createdFileParams = () =>
  mockCreateApiFileCollectionsBatch.mock.calls.flatMap((c: any[]) => {
    const { files, createCollectionParams } = c[0] as any;
    return files.map((file: any) => ({ ...createCollectionParams, ...file }));
  });
const createdBatchFiles = () =>
  mockCreateApiFileCollectionsBatch.mock.calls.flatMap((c: any[]) => (c[0] as any).files);
/** 层级校正的入参：bulkMoveCollectionsParent 的 items（ACL 迁移 + parentId 写入同一事务） */
const correctionUpdates = () =>
  (mockBulkMoveCollectionsParent.mock.calls[0]?.[0] as any)?.items ?? [];

describe('createApiDatasetCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    objectIdState.counter = 0;
    mockListFiles.mockResolvedValue([]);
    mockCollectionFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockBulkInsertFolderCollections.mockImplementation(async ({ docs }: any) => ({
      successApiFileIds: docs.map((d: any) => d.apiFileId),
      failedApiFileIds: []
    }));
    mockBulkMoveCollectionsParent.mockImplementation(async ({ items }: any) => ({
      successIds: items.map((u: any) => u._id),
      failedIds: [],
      matchedCount: items.length
    }));
    mockMongoSessionRun.mockImplementation((fn: any) => fn('session'));
    mockCreateApiFileCollectionsBatch.mockResolvedValue({ collectionIds: [] });
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

    expect(mockCreateApiFileCollectionsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset,
        files: [expect.objectContaining({ apiFileId: 'doc-1' })],
        createCollectionParams: expect.objectContaining({ type: 'apiFile' }),
        session: 'session'
      })
    );
  });

  it.each([
    ['yuque', { yuqueServer: { userId: 'yuque-user' } }],
    ['dingtalk', { dingtalkServer: { appKey: 'ding-app', userId: 'user-id' } }]
  ])('%s 未配置根路径时，全选从 provider 根枚举', async (_, apiDatasetServer) => {
    await call({
      apiFiles: [apiFile(RootCollectionId, 'folder', true, 'ROOT_FOLDER')],
      dataset: createDataset(apiDatasetServer)
    });

    expect(mockListFiles).toHaveBeenCalledWith({ parentId: undefined });
    expect(mockListFiles).not.toHaveBeenCalledWith({ parentId: RootCollectionId });
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
    // ⑤ 本次选中的最外层 folder 没有 server 父级 → 落知识库根。
    //    请求体 parentId（'KB_FOLDER'）被忽略：落位不由浏览位置决定
    expect(findFolder('l1').parentId).toBeNull();
    // ⑥ 最外层 folder 没有 server 父级：落缺字段而不是 null。
    //    落 null 会让出参 schema 校验抛 invalid_type，/collection/detail 直接 500
    expect(findFolder('l1').apiFileParentId).toBeUndefined();

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

  it('T3-4 单文件导入：忽略请求体 parentId，落知识库根', async () => {
    await call({ apiFiles: [apiFile('f1', 'file')], parentId: 'KB_SELECTED' });

    expect(createdFileParams()).toHaveLength(1);
    expect(createdFileParams()[0].apiFileId).toBe('f1');
    // 无 server 父级 → null → 落库时归一为缺字段；'KB_SELECTED' 不参与落位
    expect(createdFileParams()[0].parentId).toBeUndefined();
    expect(createdFileParams()[0].apiFileParentId).toBeUndefined();
  });

  it('T3-5 请求体 parentId 被忽略：层级一律由 server 树推导', async () => {
    setServerTree({
      l1: [apiFile('l2', 'folder', true)],
      l2: [apiFile('l3', 'folder', true)],
      l3: [apiFile('l4', 'file')]
    });

    await call({ apiFiles: [apiFile('l1', 'folder', true)], parentId: 'KB_FOLDER' });

    expect(createdFileParams()[0].parentId).toBe(String(findFolder('l3')._id));
    expect(findFolder('l1').parentId).toBeNull();
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
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();

    // 校正条目：c 重挂到 b，d 已经正确所以不出现
    const updates = correctionUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0]._id).toBe('C');
    expect(String(updates[0].newParentId)).toBe(String(b._id));
    expect(updates[0].apiFileParentId).toBe('b');
    expect(updates.find((u: any) => u._id === 'D')).toBeUndefined();
  });

  it('T3-6b 同次选择子目录再选择祖先时，按祖先路径创建且不重复', async () => {
    setServerTree({
      a: [apiFile('b', 'folder', true)],
      b: [apiFile('c', 'file')]
    });

    const result = await call({
      apiFiles: [apiFile('b', 'folder', true), apiFile('a', 'folder', true)]
    });

    expect(folderDocs().map((doc: any) => doc.apiFileId)).toEqual(['a', 'b']);
    expect(String(findFolder('b').parentId)).toBe(String(findFolder('a')._id));
    expect(createdBatchFiles().map((file: any) => file.apiFileId)).toEqual(['c']);
    expect(result).toEqual({ successCount: 3, failedCount: 0 });
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
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
    // 校正为空时不发起 ACL 迁移/parentId 写入：无变更就不该开事务
    expect(mockBulkMoveCollectionsParent).not.toHaveBeenCalled();
    expect(result).toEqual({ successCount: 0, failedCount: 0 });
    // 校正未失败：不得出现校正失败告警（防止把 warn 写成无条件）
    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      'Create api file collection parent update failed',
      expect.anything()
    );
  });

  it('T3-8 550 个平铺文件单事务整批创建', async () => {
    const files = Array.from({ length: 550 }, (_, i) => apiFile(`f${i}`, 'file'));

    const result = await call({ apiFiles: files });

    // 不再按 200 分批：一个 session、一次批量调用覆盖全部文件
    expect(mockMongoSessionRun).toHaveBeenCalledTimes(1);
    expect(mockCreateApiFileCollectionsBatch).toHaveBeenCalledTimes(1);
    expect(createdBatchFiles()).toHaveLength(550);
    expect(createdBatchFiles()[0].apiFileId).toBe('f0');
    expect(result).toEqual({ successCount: 550, failedCount: 0 });
  });

  it('T3-9 1200 个同层 folder 一次 bulkInsertFolderCollections 交付', async () => {
    const folders = Array.from({ length: 1200 }, (_, i) => apiFile(`d${i}`, 'folder'));

    await call({ apiFiles: folders });

    expect(mockBulkInsertFolderCollections).toHaveBeenCalledTimes(1);
    expect((mockBulkInsertFolderCollections.mock.calls[0][0] as any).docs).toHaveLength(1200);
  });

  it('T3-10 顶层节点无 server 父级：请求体 parentId 被忽略，落知识库根', async () => {
    await call({ apiFiles: [apiFile('top', 'folder')], parentId: 'KB_ROOT' });

    expect(folderDocs()).toHaveLength(1);
    expect(folderDocs()[0].parentId).toBeNull();
  });

  it('T3-11 父级写入失败：整棵子树跳过且不回退到请求体 parentId', async () => {
    setServerTree({
      l1: [apiFile('l2', 'folder', true)],
      l2: [apiFile('l3', 'folder', true)],
      l3: [apiFile('l4', 'file')]
    });
    mockBulkInsertFolderCollections.mockImplementation(async ({ docs }: any) => {
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

    // L2 失败 -> L3 与 file 均不创建，绝不回退到请求体 parentId / 知识库根
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
    expect(findFolder('l3')).toBeUndefined();
    // 1 个成功（l1）+ 失败 3（l2、l3、l4 整棵）
    expect(result).toEqual({ successCount: 1, failedCount: 3 });
  });

  it('T3-12 file 事务失败：整批计入失败，不留部分成功', async () => {
    const files = Array.from({ length: 550 }, (_, i) => apiFile(`f${i}`, 'file'));
    mockCreateApiFileCollectionsBatch.mockRejectedValue(new Error('batch failed'));

    // 必须 reject 而非返回 200：客户端只在请求失败时才把文件标为失败，
    // 否则 4w 个文件全部回滚、只剩 folder 骨架，用户仍看到「导入成功」
    await expect(call({ apiFiles: files })).rejects.toThrow('batch failed');

    // 超时/失败后无法判断批内哪些已落库，故全部计入失败（服务端整批回滚）
    expect(mockMongoSessionRun).toHaveBeenCalledTimes(1);
    // 整批失败必须留下服务端信号，否则静默丢失
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Create api file collection batch failed',
      expect.objectContaining({ datasetId: 'dataset-id', batchSize: 550 })
    );
  });

  it('T3-13 校正失败不阻断 file 批量创建', async () => {
    setServerTree({
      p: [apiFile('c', 'folder', true)],
      c: [apiFile('f', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([{ _id: 'C', apiFileId: 'c', apiFileParentId: null, parentId: null }])
    });
    mockBulkMoveCollectionsParent.mockResolvedValue({
      successIds: [],
      failedIds: ['C'],
      matchedCount: 1
    });

    const result = await call({ apiFiles: [apiFile('p', 'folder', true)] });

    expect(correctionUpdates()).toHaveLength(1);
    // 计数只描述本次创建；层级校正失败仅通过日志暴露，不混入 failedCount
    expect(result.failedCount).toBe(0);
    expect(mockCreateApiFileCollectionsBatch).toHaveBeenCalled();
    // 校正失败必须记 WARN，否则 40k 规模下无人可查
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Create api file collection parent update failed',
      expect.objectContaining({ datasetId: 'dataset-id', failedCount: 1 })
    );
  });

  it('T3-14 空输入：不写任何数据', async () => {
    const result = await call({ apiFiles: [] });

    expect(mockBulkInsertFolderCollections).not.toHaveBeenCalled();
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
    expect(result).toEqual({ successCount: 0, failedCount: 0 });
  });

  it('T3-15 拉取失败：接口 reject 且无任何写入', async () => {
    mockListFiles.mockRejectedValue(new Error('server down'));

    await expect(call({ apiFiles: [apiFile('l1', 'folder', true)] })).rejects.toThrow(
      'server down'
    );

    expect(mockBulkInsertFolderCollections).not.toHaveBeenCalled();
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
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
    mockBulkInsertFolderCollections.mockImplementation(async ({ docs }: any) => {
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
    mockBulkInsertFolderCollections.mockImplementation(async ({ docs }: any) => {
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
    expect(String(updates[0].newParentId)).toBe(String(findFolder('n')._id));
    expect(updates[0].apiFileParentId).toBe('n');
    expect(updates.find((u: any) => u._id === 'EXQ')).toBeUndefined();

    // 已存在节点不重建
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
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
    mockBulkMoveCollectionsParent.mockImplementation(async ({ items }: any) => ({
      successIds: [],
      failedIds: items.map((u: any) => u._id),
      matchedCount: items.length
    }));

    const result = await call({ apiFiles: [apiFile('p', 'folder', true)] });

    expect(correctionUpdates()).toHaveLength(12);
    expect(result.failedCount).toBe(0);
    // 40k 规模下 failedIds 可能上万条，日志只带 count + 前 10 条样本
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Create api file collection parent update failed',
      expect.objectContaining({
        failedCount: 12,
        failedIdsSample: ['EX0', 'EX1', 'EX2', 'EX3', 'EX4', 'EX5', 'EX6', 'EX7', 'EX8', 'EX9']
      })
    );
  });

  it('T3-20 根哨兵 scope：server 根级 folder/file 的本地父级是哨兵行（与同步路径收敛）', async () => {
    setServerTree({
      'dingtalk-root': [apiFile('root-folder', 'folder', true), apiFile('root-file', 'file')],
      'root-folder': [apiFile('deep-file', 'file')]
    });

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

    const sentinel = findFolder(RootCollectionId);
    expect(sentinel).toBeTruthy();
    // 哨兵自身落在 dataset 根（没有请求体父级）
    expect(sentinel.parentId).toBeNull();
    // 哨兵不是真实 server 节点，没有 server 父级：同样落缺字段而不是 null
    expect(sentinel.apiFileParentId).toBeUndefined();

    // server 根级 folder 挂在哨兵行之下，直系 server 父级记为哨兵 id
    expect(String(findFolder('root-folder').parentId)).toBe(String(sentinel._id));
    expect(findFolder('root-folder').apiFileParentId).toBe(RootCollectionId);

    // server 根级 file 同样挂在哨兵行之下，而不是 dataset 根
    const rootFileParams = createdFileParams().find(
      (params: any) => params.apiFileId === 'root-file'
    );
    expect(rootFileParams.parentId).toBe(String(sentinel._id));
    expect(rootFileParams.apiFileParentId).toBe(RootCollectionId);
    // 子级 file 的父级是 root-folder 行
    const deepFileParams = createdFileParams().find(
      (params: any) => params.apiFileId === 'deep-file'
    );
    expect(deepFileParams.parentId).toBe(String(findFolder('root-folder')._id));
    expect(deepFileParams.apiFileParentId).toBe('root-folder');
  });

  /**
   * 回归场景：目录骨架整体漏传 inheritPermission —— 文件走 `...body` 落成请求指定的独立态，
   * 目录却落成 schema default（继承态）。同一次导入里两者口径相反，而继承态目录的快照 =
   * merge(父级, owner)：在「内容不随父级扩散」的预期下，目录名与层级仍对所有父级协作者可见。
   * 本用例钉住目录 doc 带上该值，且与文件侧同口径（防止只修一半）。
   */
  it('T3-21 请求 inheritPermission=false 只作用于显式选中的节点', async () => {
    setServerTree({
      p: [apiFile('c', 'folder', true), apiFile('f', 'file')],
      c: [apiFile('g', 'file')]
    });

    await call({
      apiFiles: [apiFile('p', 'folder', true), apiFile('f', 'file')],
      parentId: 'KB_ROOT',
      inheritPermission: false
    });

    // 选中的 p 落独立态；展开出的 c 保持继承（权限跟随 p，p 的 ACL 变了它才跟着变）
    expect(folderDocs().map((doc: any) => [doc.apiFileId, doc.inheritPermission])).toEqual([
      ['p', false],
      ['c', undefined]
    ]);
    // file 侧同口径：选中的 f 独立，展开出的 g 继承
    expect(
      createdFileParams().map((params: any) => [params.apiFileId, params.inheritPermission])
    ).toEqual([
      ['f', false],
      ['g', undefined]
    ]);
  });

  it('T3-22 未传 inheritPermission 时目录不落独立态', async () => {
    await call({ apiFiles: [apiFile('p', 'folder')], parentId: 'KB_ROOT' });

    // 交给 schema default（继承）；显式写成 false 会静默改变默认语义
    expect(findFolder('p').inheritPermission).not.toBe(false);
  });

  /**
   * 边界场景：选中一个「带子文档的 file」时，它会产出「同名目录 #dir + 正文」两条记录。
   * #dir 是该选中节点自身的目录，必须与正文同落独立态；漏掉它就会留下一条继承态目录，
   * 选中文档的子文档全挂在这条目录下，等于把独立态在中间断开。
   */
  it('T3-23 选中带子文档的 file 时，其同名目录同属该节点', async () => {
    setServerTree({ f: [apiFile('sub', 'file')] });

    await call({
      apiFiles: [apiFile('f', 'file', true)],
      parentId: 'KB_ROOT',
      inheritPermission: false
    });

    expect(folderDocs().map((doc: any) => [doc.apiFileId, doc.inheritPermission])).toEqual([
      ['f#dir', false]
    ]);
    // 正文 f 属选中节点；子文档 sub 是展开出来的，保持继承
    expect(
      createdFileParams().map((params: any) => [params.apiFileId, params.inheritPermission])
    ).toEqual([
      ['f', false],
      ['sub', undefined]
    ]);
  });

  /**
   * 安全场景：全选导入时请求体只带根哨兵，落库的却是它展开出的真实节点。独立态必须落在
   * 真实存在的锚点上，否则「独立配置」会被静默丢弃 —— 整库仍继承 dataset 快照，父级协作者
   * 就能看到本应独立的文件库内容。
   * 哨兵本身是一条真实 collection 行（T3-20），由它承载独立态、全树继承它，因此这里同时钉住
   * 「哨兵落独立态」与「展开出的根级节点都挂在哨兵之下」两条：少任何一条，独立态就断开。
   */
  it('T3-25 全选导入 + inheritPermission=false：哨兵承载独立态，展开出的根级节点继承它', async () => {
    setServerTree({
      'server-root': [apiFile('root-folder', 'folder', true), apiFile('root-file', 'file')],
      'root-folder': [apiFile('deep-file', 'file')]
    });

    const dataset = createDataset({
      dingtalkServer: {
        appKey: 'ding-app',
        userId: 'user-id',
        rootNodeId: 'server-root'
      }
    });

    await createApiDatasetCollection({
      datasetId: 'dataset-id',
      apiFiles: [apiFile(RootCollectionId, 'folder', true, 'ROOT_FOLDER')],
      customPdfParse: false,
      trainingType: 'chunk',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      inheritPermission: false,
      dataset
    } as any);

    // ① 独立态落在哨兵行上（它是本轮唯一被显式选中的节点）
    const sentinel = findFolder(RootCollectionId);
    expect(sentinel.inheritPermission).toBe(false);

    // ② 展开出的根级节点全部以哨兵为父级、自身保持继承：快照 = merge(哨兵=[owner], owner)
    //    → 不含 dataset 协作者，整库对父级协作者不可见
    expect(String(findFolder('root-folder').parentId)).toBe(String(sentinel._id));
    expect(findFolder('root-folder').inheritPermission).toBeUndefined();

    const rootFile = createdFileParams().find((params: any) => params.apiFileId === 'root-file');
    expect(String(rootFile.parentId)).toBe(String(sentinel._id));
    expect(rootFile.inheritPermission).toBeUndefined();

    // ③ 更深层同理：继承链一路回到哨兵，中间不出现第二个独立态断点
    expect(findFolder('root-folder').inheritPermission).not.toBe(false);
    const deepFile = createdFileParams().find((params: any) => params.apiFileId === 'deep-file');
    expect(deepFile.inheritPermission).toBeUndefined();
  });

  it('T3-24 已有同 apiFileId 的正文记录不能被复用为派生目录', async () => {
    setServerTree({ doc: [apiFile('child', 'file')] });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'REAL_FILE',
          apiFileId: 'doc#dir',
          type: 'apiFile',
          parentId: null
        }
      ])
    });

    await expect(call({ apiFiles: [apiFile('doc', 'file', true)] })).rejects.toThrow(
      'Api file record type conflicts with existing collection: apiFileId=doc#dir'
    );
    expect(mockBulkInsertFolderCollections).not.toHaveBeenCalled();
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
  });
});
