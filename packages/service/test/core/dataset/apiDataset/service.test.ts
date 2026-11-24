import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';

const {
  mockListFiles,
  mockCreateApiFileCollectionsBatch,
  mockBulkInsertFolderCollections,
  mockBulkMoveCollectionsParent,
  mockCollectionFind,
  mockCollectionUpdateMany,
  mockDatasetUpdateOne,
  mockMongoSessionRun,
  mockEnqueueDatasetPermissionSync,
  mockLoggerWarn,
  mockLoggerError
} = vi.hoisted(() => ({
  mockListFiles: vi.fn(),
  mockCreateApiFileCollectionsBatch: vi.fn(),
  mockBulkInsertFolderCollections: vi.fn(),
  mockBulkMoveCollectionsParent: vi.fn(),
  mockCollectionFind: vi.fn(),
  mockCollectionUpdateMany: vi.fn(),
  mockDatasetUpdateOne: vi.fn(),
  mockMongoSessionRun: vi.fn(),
  mockEnqueueDatasetPermissionSync: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  LogCategories: { MODULE: { DATASET: 'dataset' } },
  getLogger: () => ({ info: vi.fn(), warn: mockLoggerWarn, error: mockLoggerError })
}));

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: { updateOne: mockDatasetUpdateOne }
}));

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: { updateOne: mockDatasetUpdateOne }
}));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: { find: mockCollectionFind, updateMany: mockCollectionUpdateMany }
}));

vi.mock('@fastgpt/service/core/dataset/apiDataset', () => ({
  getApiDatasetRequest: vi.fn(async () => ({
    listFiles: mockListFiles
  }))
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mockMongoSessionRun
}));

vi.mock('@fastgpt/service/core/dataset/datasetPermissionSync', () => ({
  enqueueDatasetPermissionSync: mockEnqueueDatasetPermissionSync
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', () => ({
  createApiFileCollectionsBatch: mockCreateApiFileCollectionsBatch,
  bulkInsertFolderCollections: mockBulkInsertFolderCollections,
  bulkMoveCollectionsParent: mockBulkMoveCollectionsParent,
  // 整批事务的提交上限；数值本身由 controller 的单测覆盖，这里只要求被显式传入
  API_FILE_FILE_COMMIT_TIMEOUT_MS: 5 * 60 * 1000
}));

import { createApiDatasetCollection } from '@fastgpt/service/core/dataset/apiDataset/service';
import { getApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset';

/** 本地 collection 使用真实 ObjectId；别名只用于表达测试中的树关系。 */
const localIds = new Map<string, string>();
const localId = (name: string): string => {
  if (!localIds.has(name)) localIds.set(name, String(new Types.ObjectId()));
  return localIds.get(name)!;
};

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

beforeEach(() => {
  vi.clearAllMocks();
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
  mockCollectionUpdateMany.mockResolvedValue({ modifiedCount: 0 });
  mockDatasetUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockEnqueueDatasetPermissionSync.mockResolvedValue(undefined);
});

describe('createApiDatasetCollection', () => {
  it.each([
    ['custom 未配置根路径', { apiServer: {} }],
    ['yuque 未配置根路径', { yuqueServer: { userId: 'yuque-user' } }],
    ['feishu 未配置根路径', { feishuServer: { appId: 'feishu-app' } }],
    ['dingtalk 未配置根路径', { dingtalkServer: { appKey: 'ding-app', userId: 'user-id' } }]
  ])('%s 全选以 provider 根的直接子节点为种子', async (_, apiDatasetServer) => {
    await call({
      syncAll: true,
      apiFiles: [],
      dataset: createDataset(apiDatasetServer)
    });

    expect(mockListFiles).toHaveBeenCalledWith({ parentId: undefined });
    expect(mockDatasetUpdateOne).toHaveBeenCalledWith(
      { _id: 'dataset-id', teamId: 'team-id' },
      { $set: { syncAll: true } },
      { session: 'session' }
    );
  });

  it.each([
    ['custom', { apiServer: { basePath: 'configured-root' } }],
    ['yuque', { yuqueServer: { basePath: 'configured-root' } }],
    ['feishu', { feishuServer: { folderToken: 'configured-root' } }]
  ])('%s 全选使用配置的根路径', async (_, apiDatasetServer) => {
    await call({
      syncAll: true,
      apiFiles: [],
      dataset: createDataset(apiDatasetServer)
    });
    expect(mockListFiles).toHaveBeenCalledWith({ parentId: 'configured-root' });
  });
  it('四层层级：folder 逐层写 parentId，file 落在 L3 之下', async () => {
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
    expect(findFolder('l1').inheritPermission).toBeUndefined();

    // ②③ file 的 parentId 是 L3 的 _id，apiFileParentId 是 'l3'
    expect(createdFileParams()).toHaveLength(1);
    expect(createdFileParams()[0].apiFileId).toBe('l4');
    expect(createdFileParams()[0].parentId).toBe(String(findFolder('l3')._id));
    expect(createdFileParams()[0].apiFileParentId).toBe('l3');

    expect(result).toEqual({ successCount: 4, failedCount: 0 });
  });

  it('中间层 folder 已存在：不重复创建，子级挂到已存在 _id', async () => {
    setServerTree({
      l1: [apiFile('l2', 'folder', true)],
      l2: [apiFile('l3', 'folder', true)],
      l3: [apiFile('l4', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([
          { _id: localId('existing-l2-id'), apiFileId: 'l2', apiFileParentId: null, parentId: null }
        ])
    });

    await call({ apiFiles: [apiFile('l1', 'folder', true)], parentId: 'KB_ROOT' });

    expect(findFolder('l2')).toBeUndefined();
    expect(String(findFolder('l3').parentId)).toBe(localId('existing-l2-id'));
    expect(createdFileParams()[0].parentId).toBe(String(findFolder('l3')._id));
  });

  it('单文件导入：忽略请求体 parentId，落知识库根', async () => {
    await call({ apiFiles: [apiFile('f1', 'file')], parentId: 'KB_SELECTED' });

    expect(createdFileParams()).toHaveLength(1);
    expect(createdFileParams()[0].apiFileId).toBe('f1');
    // 无 server 父级 → null → 落库时归一为缺字段；'KB_SELECTED' 不参与落位
    expect(createdFileParams()[0].parentId).toBeUndefined();
    expect(createdFileParams()[0].apiFileParentId).toBeUndefined();
  });

  it('渐进导入收敛：后导入祖先时校正已有子树', async () => {
    setServerTree({
      b: [apiFile('c', 'folder', true)],
      c: [apiFile('d', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: localId('C'), apiFileId: 'c', apiFileParentId: null, parentId: null },
        { _id: localId('D'), apiFileId: 'd', apiFileParentId: 'c', parentId: localId('C') }
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
    expect(updates[0]._id).toBe(localId('C'));
    expect(String(updates[0].newParentId)).toBe(String(b._id));
    expect(updates[0].apiFileParentId).toBe('b');
    expect(updates.find((u: any) => u._id === localId('D'))).toBeUndefined();
  });

  it('同次选择子目录再选择祖先时，按祖先路径创建且不重复', async () => {
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

  it('重复导入幂等：无新增、校正为空、计数为 0', async () => {
    setServerTree({
      l1: [apiFile('l2', 'folder', true)],
      l2: [apiFile('l3', 'folder', true)],
      l3: [apiFile('l4', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: localId('OID_L1'), apiFileId: 'l1', apiFileParentId: null, parentId: null },
        {
          _id: localId('OID_L2'),
          apiFileId: 'l2',
          apiFileParentId: 'l1',
          parentId: localId('OID_L1')
        },
        {
          _id: localId('OID_L3'),
          apiFileId: 'l3',
          apiFileParentId: 'l2',
          parentId: localId('OID_L2')
        },
        {
          _id: localId('OID_L4'),
          apiFileId: 'l4',
          apiFileParentId: 'l3',
          parentId: localId('OID_L3')
        }
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

  it('550 个平铺文件单事务整批创建', async () => {
    const files = Array.from({ length: 550 }, (_, i) => apiFile(`f${i}`, 'file'));

    const result = await call({ apiFiles: files });

    // 不再按 200 分批：一个 session、一次批量调用覆盖全部文件
    expect(mockMongoSessionRun).toHaveBeenCalledTimes(1);
    expect(mockCreateApiFileCollectionsBatch).toHaveBeenCalledTimes(1);
    expect(createdBatchFiles()).toHaveLength(550);
    expect(createdBatchFiles()[0].apiFileId).toBe('f0');
    expect(result).toEqual({ successCount: 550, failedCount: 0 });
  });

  it('1200 个同层 folder 一次 bulkInsertFolderCollections 交付', async () => {
    const folders = Array.from({ length: 1200 }, (_, i) => apiFile(`d${i}`, 'folder'));

    await call({ apiFiles: folders });

    expect(mockBulkInsertFolderCollections).toHaveBeenCalledTimes(1);
    expect((mockBulkInsertFolderCollections.mock.calls[0][0] as any).docs).toHaveLength(1200);
  });

  it('file 事务失败：整批计入失败，不留部分成功', async () => {
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

  it('ACL 层级迁移抛错时中止导入，不继续创建新文件', async () => {
    setServerTree({ p: [apiFile('old', 'file'), apiFile('new', 'file')] });
    mockCollectionFind.mockReturnValue({
      lean: vi
        .fn()
        .mockResolvedValue([
          { _id: localId('old'), apiFileId: 'old', type: 'apiFile', parentId: null }
        ])
    });
    const error = new Error('Bulk move collection parent failed');
    mockBulkMoveCollectionsParent.mockRejectedValueOnce(error);
    await expect(call({ apiFiles: [apiFile('p', 'folder', true)] })).rejects.toBe(error);
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
  });

  it('实际落位鉴权失败时，在目录、层级和正文写入之前中止', async () => {
    setServerTree({ root: [apiFile('child', 'file')] });
    const authorizeChanges = vi.fn().mockRejectedValue(new Error('restricted parent'));
    await expect(
      call({ apiFiles: [apiFile('root', 'folder', true)], authorizeChanges })
    ).rejects.toThrow('restricted parent');
    expect(authorizeChanges).toHaveBeenCalledOnce();
    expect(mockBulkInsertFolderCollections).not.toHaveBeenCalled();
    expect(mockBulkMoveCollectionsParent).not.toHaveBeenCalled();
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
  });

  it('外部权限同步托管时跳过 collection 级鉴权：落位由 server 树推导，本地 ACL 不代表访问权', async () => {
    setServerTree({ root: [apiFile('child', 'file')] });
    const authorizeChanges = vi.fn();

    const result = await call({
      apiFiles: [apiFile('root', 'folder', true)],
      authorizeChanges,
      dataset: createDataset({ apiServer: {}, permissionSync: true })
    });

    expect(authorizeChanges).not.toHaveBeenCalled();
    // 跳过鉴权不影响实际写入
    expect(result.successCount).toBe(2);
  });

  it('外部权限同步托管且开启 syncAll 时仍校验 enableDatasetSyncAll（知识库 Manage 权限）', async () => {
    setServerTree({ undefined: [apiFile('root', 'file')] });
    const authorizeChanges = vi.fn();

    await call({
      syncAll: true,
      apiFiles: [],
      authorizeChanges,
      dataset: createDataset({ apiServer: {}, permissionSync: true })
    });

    expect(authorizeChanges).toHaveBeenCalledTimes(1);
    expect(authorizeChanges).toHaveBeenCalledWith({
      creationParentIds: [],
      newFolderIds: new Set(),
      moves: [],
      enableDatasetSyncAll: true
    });
  });

  it.each(['self', 'descendant'])('V1 重复导入在任何写入前拒绝目录环：%s', async (mode) => {
    const parent = localId('parent');
    const child = localId('child');
    mockCollectionFind.mockReturnValue({
      lean: async () => [
        { _id: parent, apiFileId: 'parent', type: 'folder', parentId: null },
        {
          _id: child,
          apiFileId: 'child',
          type: 'folder',
          parentId: parent,
          apiFileParentId: 'parent'
        }
      ]
    });
    setServerTree({ parent: [apiFile('child', 'folder')] });
    await expect(
      call({
        apiFiles: [apiFile('parent', 'folder', true)],
        targetParentId: mode === 'self' ? parent : child
      })
    ).rejects.toThrow('Circular parent plan');
    expect(mockBulkInsertFolderCollections).not.toHaveBeenCalled();
    expect(mockBulkMoveCollectionsParent).not.toHaveBeenCalled();
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
  });

  it('空输入：不写任何数据', async () => {
    const result = await call({ apiFiles: [] });

    expect(mockBulkInsertFolderCollections).not.toHaveBeenCalled();
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
    expect(result).toEqual({ successCount: 0, failedCount: 0 });
  });

  it('拉取失败：接口 reject 且无任何写入', async () => {
    mockListFiles.mockRejectedValue(new Error('server down'));

    await expect(call({ apiFiles: [apiFile('l1', 'folder', true)] })).rejects.toThrow(
      'server down'
    );

    expect(mockBulkInsertFolderCollections).not.toHaveBeenCalled();
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
  });

  it('folder 批内部分落库：落库分支的子级照常挂载，失败分支的子树跳过', async () => {
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

    const result = await call({
      apiFiles: [apiFile('top', 'folder', true)],
      parentId: 'KB_FOLDER'
    });

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

  it('已存在节点的新父级本轮失败：保留原父级（不重挂），同批落库的父级仍校正', async () => {
    setServerTree({
      p: [apiFile('q', 'folder', true), apiFile('n', 'folder', true)],
      q: [apiFile('ex-q', 'file')],
      n: [apiFile('ex-n', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: localId('EXQ'),
          apiFileId: 'ex-q',
          apiFileParentId: 'q',
          parentId: localId('STALE')
        },
        {
          _id: localId('EXN'),
          apiFileId: 'ex-n',
          apiFileParentId: null,
          parentId: localId('STALE')
        }
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
    expect(updates[0]._id).toBe(localId('EXN'));
    expect(String(updates[0].newParentId)).toBe(String(findFolder('n')._id));
    expect(updates[0].apiFileParentId).toBe('n');
    expect(updates.find((u: any) => u._id === localId('EXQ'))).toBeUndefined();

    // 已存在节点不重建
    expect(mockCreateApiFileCollectionsBatch).not.toHaveBeenCalled();
    // p + n 成功；q 失败
    expect(result).toEqual({ successCount: 2, failedCount: 1 });
  });

  it('校正失败日志有界：只采样前 10 条失败 id', async () => {
    const fileIds = Array.from({ length: 12 }, (_, i) => `f${i}`);
    setServerTree({
      p: [...fileIds.map((id) => apiFile(id, 'file')), apiFile('new-file', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue(
        fileIds.map((apiFileId, i) => ({
          _id: localId(`EX${i}`),
          apiFileId,
          apiFileParentId: 'p',
          parentId: localId('STALE')
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
    expect(createdBatchFiles().map((file: any) => file.apiFileId)).toEqual(['new-file']);
    // 40k 规模下 failedIds 可能上万条，日志只带 count + 前 10 条样本
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Create api file collection parent update failed',
      expect.objectContaining({
        failedCount: 12,
        failedIdsSample: [
          localId('EX0'),
          localId('EX1'),
          localId('EX2'),
          localId('EX3'),
          localId('EX4'),
          localId('EX5'),
          localId('EX6'),
          localId('EX7'),
          localId('EX8'),
          localId('EX9')
        ]
      })
    );
  });

  it.each([undefined, false])(
    'syncAll=true 整库导入直接落知识库根，不创建哨兵且仅顶层节点继承权限标记 %s',
    async (inheritPermission) => {
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
      const authorizeChanges = vi.fn();

      const result = await createApiDatasetCollection({
        datasetId: 'dataset-id',
        syncAll: true,
        apiFiles: [],
        customPdfParse: false,
        trainingType: 'chunk',
        teamId: 'team-id',
        tmbId: 'tmb-id',
        dataset,
        inheritPermission,
        authorizeChanges
      } as any);

      expect(getApiDatasetRequest).toHaveBeenCalledWith(dataset.apiDatasetServer);
      expect(mockListFiles).toHaveBeenCalledWith({ parentId: 'dingtalk-root' });
      expect(authorizeChanges).toHaveBeenCalledWith(
        expect.objectContaining({ enableDatasetSyncAll: true })
      );
      expect(mockDatasetUpdateOne).toHaveBeenCalledWith(
        { _id: 'dataset-id', teamId: 'team-id' },
        { $set: { syncAll: true } },
        { session: 'session' }
      );
      expect(mockCollectionUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team-id',
          datasetId: 'dataset-id',
          syncChildren: false
        }),
        { $set: { syncChildren: true } },
        { session: 'session' }
      );

      // 不创建任何哨兵节点，仅真实远端目录落库且直接挂在知识库根
      expect(folderDocs().map((doc: any) => doc.apiFileId)).toEqual(['root-folder']);
      expect(findFolder('root-folder').parentId).toBeNull();
      expect(findFolder('root-folder').apiFileParentId).toBeUndefined();
      expect(findFolder('root-folder').inheritPermission).toBe(inheritPermission);

      // server 根级 file 直接挂在知识库根（parentId/apiFileParentId 均为 undefined）
      const rootFileParams = createdFileParams().find(
        (params: any) => params.apiFileId === 'root-file'
      );
      expect(rootFileParams.parentId).toBeUndefined();
      expect(rootFileParams.apiFileParentId).toBeUndefined();
      expect(rootFileParams.inheritPermission).toBe(inheritPermission);

      // 子级 file 的父级是 root-folder 行，且保持继承态
      const deepFileParams = createdFileParams().find(
        (params: any) => params.apiFileId === 'deep-file'
      );
      expect(deepFileParams.parentId).toBe(String(findFolder('root-folder')._id));
      expect(deepFileParams.apiFileParentId).toBe('root-folder');
      expect(deepFileParams.inheritPermission).toBeUndefined();

      // successCount 不再包含该合成节点
      expect(result).toEqual({ successCount: 3, failedCount: 0 });
    }
  );

  it('混合 provider 配置下整库导入不透传失效 provider 的目录起点', async () => {
    setServerTree({
      null: [apiFile('root-file', 'file')]
    });

    const dataset = createDataset({
      apiServer: {
        baseUrl: 'https://api.example.com',
        basePath: ''
      },
      feishuServer: {
        appId: 'feishu-app',
        appSecret: 'feishu-secret',
        folderToken: 'stale-feishu-folder'
      }
    });

    await createApiDatasetCollection({
      datasetId: 'dataset-id',
      syncAll: true,
      apiFiles: [],
      customPdfParse: false,
      trainingType: 'chunk',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      dataset
    } as any);

    expect(mockListFiles).toHaveBeenCalledWith({ parentId: undefined });
    expect(mockListFiles).not.toHaveBeenCalledWith({ parentId: 'stale-feishu-folder' });
  });

  it('旧客户端传入 SYSTEM_ROOT 哨兵时自动归一为 syncAll=true，不创建或查询 SYSTEM_ROOT', async () => {
    mockListFiles.mockResolvedValueOnce([apiFile('root-file', 'file', false, 'Root File')]);
    const authorizeChanges = vi.fn().mockResolvedValue(undefined);

    await call({
      apiFiles: [apiFile('SYSTEM_ROOT', 'folder', true, 'ROOT_FOLDER')],
      authorizeChanges
    });

    expect(authorizeChanges).toHaveBeenCalledWith(
      expect.objectContaining({ enableDatasetSyncAll: true })
    );
    expect(folderDocs().map((doc: any) => doc.apiFileId)).not.toContain('SYSTEM_ROOT');
    expect(createdFileParams().map((p: any) => p.apiFileId)).toEqual(['root-file']);
    expect(mockDatasetUpdateOne).toHaveBeenCalledWith(
      { _id: 'dataset-id', teamId: 'team-id' },
      { $set: { syncAll: true } },
      { session: 'session' }
    );
  });

  it('dataset.syncAll 已为 true 但存在暂停目录时，整库导入仍校验 enableDatasetSyncAll 并在同一事务恢复', async () => {
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          apiFileId: 'paused-dir',
          type: 'folder',
          syncChildren: false
        }
      ])
    });
    mockListFiles.mockResolvedValueOnce([apiFile('other-file', 'file', false, 'Other File')]);
    const authorizeChanges = vi.fn().mockResolvedValue(undefined);

    await call({
      syncAll: true,
      apiFiles: [],
      dataset: { ...createDataset(), syncAll: true },
      authorizeChanges
    });

    expect(authorizeChanges).toHaveBeenCalledWith(
      expect.objectContaining({ enableDatasetSyncAll: true })
    );
    expect(mockDatasetUpdateOne).toHaveBeenCalledWith(
      { _id: 'dataset-id', teamId: 'team-id' },
      { $set: { syncAll: true } },
      { session: 'session' }
    );
    expect(mockCollectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-id',
        datasetId: 'dataset-id',
        syncChildren: false
      }),
      { $set: { syncChildren: true } },
      { session: 'session' }
    );
  });

  it('局部导入带 ancestorPaths 时，服务端自顶向下核验并补建 syncChildren=false 祖先目录', async () => {
    setServerTree({
      '': [apiFile('dir-a', 'folder', true, 'Dir A'), apiFile('other', 'file')],
      'dir-a': [apiFile('dir-b', 'folder', true, 'Dir B')],
      'dir-b': [apiFile('target-file', 'file', false, 'Target File'), apiFile('sibling', 'file')]
    });
    mockListFiles.mockImplementation(async ({ parentId }: any) => {
      if (parentId === undefined) {
        return [apiFile('dir-a', 'folder', true, 'Dir A'), apiFile('other', 'file')];
      }
      if (parentId === 'dir-a') return [apiFile('dir-b', 'folder', true, 'Dir B')];
      if (parentId === 'dir-b') {
        return [apiFile('target-file', 'file', false, 'Target File'), apiFile('sibling', 'file')];
      }
      return [];
    });

    await call({
      apiFiles: [apiFile('target-file', 'file', false, 'Target File')],
      ancestorPaths: {
        'target-file': ['dir-a', 'dir-b']
      },
      inheritPermission: false
    });

    // 仅创建了占位祖先 dir-a / dir-b（syncChildren=false），不展开兄弟节点 other / sibling
    expect(
      folderDocs().map((doc: any) => [doc.apiFileId, doc.syncChildren, doc.inheritPermission])
    ).toEqual([
      ['dir-a', false, undefined],
      ['dir-b', false, undefined]
    ]);
    expect(String(findFolder('dir-b').parentId)).toBe(String(findFolder('dir-a')._id));
    expect(createdFileParams().map((p: any) => p.apiFileId)).toEqual(['target-file']);
    expect(createdFileParams()[0].parentId).toBe(String(findFolder('dir-b')._id));
    expect(createdFileParams()[0].inheritPermission).toBe(false);
  });

  it('重新勾选已暂停的目录时触发 reEnableSyncFolderIds 鉴权、恢复 syncChildren=true 并补齐缺失子项', async () => {
    setServerTree({
      'paused-dir': [apiFile('existing-file', 'file'), apiFile('missing-file', 'file')]
    });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: localId('PAUSED'),
          apiFileId: 'paused-dir',
          type: 'folder',
          parentId: null,
          syncChildren: false
        },
        {
          _id: localId('EXISTING'),
          apiFileId: 'existing-file',
          type: 'apiFile',
          parentId: localId('PAUSED'),
          apiFileParentId: 'paused-dir'
        }
      ])
    });
    const authorizeChanges = vi.fn();

    await call({
      apiFiles: [apiFile('paused-dir', 'folder', true)],
      authorizeChanges
    });

    expect(authorizeChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        reEnableSyncFolderIds: [localId('PAUSED')]
      })
    );
    expect(createdFileParams().map((p: any) => p.apiFileId)).toEqual(['missing-file']);
    expect(mockCollectionUpdateMany).toHaveBeenCalledWith(
      {
        _id: { $in: [localId('PAUSED')] },
        teamId: 'team-id',
        datasetId: 'dataset-id',
        type: 'folder'
      },
      { $set: { syncChildren: true } }
    );
  });

  /**
   * 回归场景：目录骨架整体漏传 inheritPermission —— 文件走 `...body` 落成请求指定的独立态，
   * 目录却落成 schema default（继承态）。同一次导入里两者口径相反，而继承态目录的快照 =
   * merge(父级, owner)：在「内容不随父级扩散」的预期下，目录名与层级仍对所有父级协作者可见。
   * 本用例钉住目录 doc 带上该值，且与文件侧同口径（防止只修一半）。
   */
  it('请求 inheritPermission=false 只作用于显式选中的节点', async () => {
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

  /**
   * 边界场景：选中一个「带子文档的 file」时，它会产出「同名目录 #dir + 正文」两条记录。
   * #dir 是该选中节点自身的目录，必须与正文同落独立态；漏掉它就会留下一条继承态目录，
   * 选中文档的子文档全挂在这条目录下，等于把独立态在中间断开。
   */
  it('选中带子文档的 file 时，其同名目录同属该节点', async () => {
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

  it('V1 显式目标父级同时用于新增文件、目录和旧记录校正', async () => {
    const targetParentId = localId('target');
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: targetParentId, type: 'folder', parentId: null },
        { _id: localId('existing'), apiFileId: 'old', type: 'apiFile', parentId: null },
        {
          _id: localId('unchanged'),
          apiFileId: 'unchanged',
          type: 'apiFile',
          parentId: targetParentId
        }
      ])
    });
    await call({
      apiFiles: [
        apiFile('new', 'file'),
        apiFile('folder', 'folder'),
        apiFile('old', 'file'),
        apiFile('unchanged', 'file')
      ],
      targetParentId
    });
    expect(createdBatchFiles()[0].parentId).toBe(targetParentId);
    expect(String(findFolder('folder').parentId)).toBe(targetParentId);
    expect(correctionUpdates()).toEqual([
      expect.objectContaining({
        _id: localId('existing'),
        oldParentId: null,
        apiFileParentId: null
      })
    ]);
    expect(String(correctionUpdates()[0].newParentId)).toBe(targetParentId);
  });

  it('已有同 apiFileId 的正文记录不能被复用为派生目录', async () => {
    setServerTree({ doc: [apiFile('child', 'file')] });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: localId('REAL_FILE'),
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

  it('当 matchedCount 小于 corrections 数量时触发未完全命中警告', async () => {
    setServerTree({ root: [apiFile('doc', 'file')] });
    mockCollectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: localId('DOC_1'),
          apiFileId: 'doc',
          parentId: localId('OLD'),
          apiFileParentId: 'other'
        }
      ])
    });
    mockBulkMoveCollectionsParent.mockResolvedValueOnce({
      successIds: [localId('DOC_1')],
      failedIds: [],
      matchedCount: 0
    });

    await call({ apiFiles: [apiFile('root', 'folder', true)] });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Create api file collection parent correction not fully matched',
      expect.anything()
    );
  });

  describe('外部权限同步入队', () => {
    /** 本地快照查询不带 apiFileId 过滤；根节点查询按 apiFileId 过滤，用一个实现分流。 */
    const setFindByRootQuery = (localRows: any[], rootRows: any[]) =>
      mockCollectionFind.mockImplementation((filter: any) => ({
        lean: vi.fn().mockResolvedValue(filter.apiFileId ? rootRows : localRows)
      }));
    const syncDataset = () => createDataset({ apiServer: {}, permissionSync: true });
    const rootQueryIds = () => {
      const filter = mockCollectionFind.mock.calls.at(-1)![0] as { apiFileId?: { $in: string[] } };
      return filter.apiFileId?.$in;
    };

    it('只把本次选中的节点作为根入队，选中文件的 #dir 同为根', async () => {
      setServerTree({ doc: [apiFile('sub', 'file')] });
      const rootRows = [{ _id: localId('ROOT_FOLDER') }, { _id: localId('ROOT_DOC') }];
      setFindByRootQuery([], rootRows);

      await call({
        apiFiles: [apiFile('folderA', 'folder'), apiFile('doc', 'file', true)],
        dataset: syncDataset()
      });

      // 只取请求里选中的节点，不扩到展开出的子节点
      expect(new Set(rootQueryIds())).toEqual(new Set(['folderA', 'doc', 'doc#dir']));
      expect(mockEnqueueDatasetPermissionSync).toHaveBeenCalledWith({
        datasetId: 'dataset-id',
        collectionIds: [localId('ROOT_FOLDER'), localId('ROOT_DOC')]
      });
    });

    it('选中文件挂在存量目录下时只入队它自己', async () => {
      setFindByRootQuery(
        [
          { _id: localId('PARENT'), apiFileId: 'parent', type: 'folder', parentId: null },
          { _id: localId('DOC'), apiFileId: 'doc', type: 'apiFile', parentId: localId('PARENT') }
        ],
        [{ _id: localId('DOC') }]
      );

      await call({ apiFiles: [apiFile('doc', 'file')], dataset: syncDataset() });

      expect(new Set(rootQueryIds())).toEqual(new Set(['doc', 'doc#dir']));
      expect(mockEnqueueDatasetPermissionSync).toHaveBeenCalledWith({
        datasetId: 'dataset-id',
        collectionIds: [localId('DOC')]
      });
    });

    it('根节点未落库时不入队', async () => {
      setFindByRootQuery([], []);

      await call({ apiFiles: [apiFile('doc', 'file')], dataset: syncDataset() });

      expect(mockEnqueueDatasetPermissionSync).not.toHaveBeenCalled();
    });

    it('未开启 permissionSync 时不入队', async () => {
      setFindByRootQuery([], [{ _id: localId('DOC') }]);

      await call({ apiFiles: [apiFile('doc', 'file')] });

      expect(mockEnqueueDatasetPermissionSync).not.toHaveBeenCalled();
    });
  });
});
