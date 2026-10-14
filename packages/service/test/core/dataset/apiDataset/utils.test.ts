import { describe, expect, it } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import {
  buildApiFileParentUpdates,
  planLegacyApiFileFolders,
  getApiFileSyncRootIds,
  resolveApiFileRecordParent,
  type ApiFileLocalCollection
} from '@fastgpt/service/core/dataset/apiDataset/utils';
import type { ApiFileRecord } from '@fastgpt/service/core/dataset/apiDataset/tree';

const record = (overrides: Partial<ApiFileRecord> = {}): ApiFileRecord => ({
  sourceId: 'doc',
  apiFileId: 'doc',
  apiFileParentId: null,
  parentDirId: null,
  type: 'file',
  name: 'Document',
  depth: 0,
  ...overrides
});
const collection = (overrides: Partial<ApiFileLocalCollection> = {}): ApiFileLocalCollection => ({
  _id: 'local-doc',
  apiFileId: 'doc',
  type: DatasetCollectionTypeEnum.apiFile,
  parentId: null,
  ...overrides
});

describe('resolveApiFileRecordParent', () => {
  it.each([undefined, 'selected-parent'])(
    '无哨兵导入根落位与已有位置保留规则：%s',
    (targetParentId) => {
      expect(
        resolveApiFileRecordParent({ record: record(), idMap: new Map(), targetParentId })
      ).toEqual({
        parentId: targetParentId ?? null,
        apiFileParentId: null,
        preserveExistingPlacement: !targetParentId
      });
    }
  );
  it('整库同步根级记录落在哨兵下', () => {
    expect(
      resolveApiFileRecordParent({
        record: record(),
        idMap: new Map(),
        rootCollectionId: 'root-local'
      })
    ).toEqual({
      parentId: 'root-local',
      apiFileParentId: RootCollectionId,
      preserveExistingPlacement: false
    });
  });
  it('缺失目录不回退到根，正文派生目录不因远端父级为空而跳过', () => {
    expect(
      resolveApiFileRecordParent({ record: record({ parentDirId: 'doc#dir' }), idMap: new Map() })
        .parentId
    ).toBeUndefined();
    expect(
      resolveApiFileRecordParent({
        record: record({ parentDirId: 'doc#dir' }),
        idMap: new Map([['doc#dir', 'derived']])
      })
    ).toEqual({
      parentId: 'derived',
      apiFileParentId: null,
      preserveExistingPlacement: false
    });
  });
});

describe('buildApiFileParentUpdates', () => {
  it.each([null, 'manual-parent'])('局部根正文失去子级后移回派生目录原位置：%s', (parentId) => {
    expect(
      buildApiFileParentUpdates({
        records: [record()],
        idMap: new Map(),
        collections: [
          collection({ parentId: 'derived', apiFileParentId: 'obsolete' }),
          collection({
            _id: 'derived',
            apiFileId: 'doc#dir',
            type: DatasetCollectionTypeEnum.folder,
            parentId,
            metadata: { apiFileSourceId: 'doc' }
          })
        ]
      })
    ).toEqual([
      {
        _id: 'local-doc',
        type: DatasetCollectionTypeEnum.apiFile,
        inheritPermission: undefined,
        oldParentId: 'derived',
        newParentId: parentId,
        apiFileParentId: null
      }
    ]);
  });
  it('兼容有正文挂载证据的历史派生目录，不依赖来源字段存在', () => {
    expect(
      buildApiFileParentUpdates({
        records: [record()],
        idMap: new Map(),
        collections: [
          collection({ parentId: 'derived' }),
          collection({
            _id: 'derived',
            apiFileId: 'doc#dir',
            type: DatasetCollectionTypeEnum.folder
          })
        ]
      })[0].newParentId
    ).toBeNull();
  });
  it.each([
    'remote-directory-retained',
    'different-source',
    'file-parent',
    'manual-folder',
    'folder-record'
  ])('不折叠非派生目录或仍被远端保留的目录：%s', (scenario) => {
    const directory = collection({
      _id: 'parent',
      apiFileId: scenario === 'manual-folder' ? 'manual' : 'doc#dir',
      type:
        scenario === 'file-parent'
          ? DatasetCollectionTypeEnum.apiFile
          : DatasetCollectionTypeEnum.folder,
      metadata: { apiFileSourceId: scenario === 'different-source' ? 'doc#dir' : 'doc' }
    });
    const records = [record({ type: scenario === 'folder-record' ? 'folder' : 'file' })];
    if (scenario === 'remote-directory-retained')
      records.push(record({ sourceId: 'doc#dir', apiFileId: 'doc#dir', type: 'folder' }));
    expect(
      buildApiFileParentUpdates({
        records,
        idMap: new Map(),
        collections: [collection({ parentId: 'parent' }), directory]
      })
    ).toEqual([]);
  });
  it('正文移入新派生目录并清除旧远端父字段；再次执行无更新', () => {
    const records = [record({ parentDirId: 'doc#dir' })];
    const idMap = new Map([['doc#dir', 'derived']]);
    expect(
      buildApiFileParentUpdates({
        records,
        idMap,
        collections: [collection({ apiFileParentId: 'obsolete' })]
      })
    ).toEqual([
      {
        _id: 'local-doc',
        type: DatasetCollectionTypeEnum.apiFile,
        inheritPermission: undefined,
        oldParentId: null,
        newParentId: 'derived',
        apiFileParentId: null
      }
    ]);
    expect(
      buildApiFileParentUpdates({
        records,
        idMap,
        collections: [collection({ parentId: 'derived' })]
      })
    ).toEqual([]);
  });
  it('新记录、导入根和父层写入失败均不产生错误移动', () => {
    expect(
      buildApiFileParentUpdates({ records: [record()], idMap: new Map(), collections: [] })
    ).toEqual([]);
    expect(
      buildApiFileParentUpdates({
        records: [record()],
        idMap: new Map(),
        collections: [collection({ parentId: 'manual' })]
      })
    ).toEqual([]);
    expect(
      buildApiFileParentUpdates({
        records: [record({ parentDirId: 'missing' })],
        idMap: new Map(),
        collections: [collection()]
      })
    ).toEqual([]);
  });
});

describe('getApiFileSyncRootIds', () => {
  it('真实远端 doc#dir 目录不会仅因存在同名正文就被误归并', () => {
    expect(
      getApiFileSyncRootIds([
        collection({
          _id: 'real-folder',
          apiFileId: 'doc#dir',
          type: DatasetCollectionTypeEnum.folder
        }),
        collection(),
        collection({
          apiFileId: undefined,
          type: DatasetCollectionTypeEnum.folder,
          metadata: { apiFileSourceId: 'manual' }
        })
      ])
    ).toEqual(['doc#dir', 'doc']);
  });
  it('历史正文尚未重挂时，可由子文档挂载关系证明派生目录来源', () => {
    expect(
      getApiFileSyncRootIds([
        collection({
          _id: 'derived',
          apiFileId: 'doc#dir',
          type: DatasetCollectionTypeEnum.folder
        }),
        collection(),
        collection({
          _id: 'child',
          apiFileId: 'child',
          apiFileParentId: 'doc',
          parentId: 'derived'
        })
      ])
    ).toEqual(['doc']);
  });

  it('新目录无正文时仍使用远端 sourceId，后代不会被错误当作导入根', () => {
    expect(
      getApiFileSyncRootIds([
        collection({
          apiFileId: 'doc#dir',
          type: DatasetCollectionTypeEnum.folder,
          metadata: { apiFileSourceId: 'doc' }
        }),
        collection({ apiFileId: 'child', apiFileParentId: 'doc' })
      ])
    ).toEqual(['doc']);
  });
  it('历史派生目录和正文归并同一同步根，不裁剪任意真实 provider ID', () => {
    expect(
      getApiFileSyncRootIds([
        collection({
          _id: 'derived',
          apiFileId: 'doc#dir',
          type: DatasetCollectionTypeEnum.folder
        }),
        collection({ parentId: 'derived' }),
        collection({ apiFileId: 'real#dir', type: DatasetCollectionTypeEnum.folder }),
        collection({ apiFileId: RootCollectionId, type: DatasetCollectionTypeEnum.folder }),
        collection({ apiFileId: undefined })
      ])
    ).toEqual(['doc', 'real#dir']);
  });
});

describe('planLegacyApiFileFolders', () => {
  const apiDatasetServer = { dingtalkServer: { appKey: 'key', userId: 'user' } };
  const legacy = () =>
    collection({
      type: DatasetCollectionTypeEnum.folder,
      metadata: { custom: 'keep' },
      parentId: 'manual'
    });
  it.each([true, false])(
    '旧正文有子级=%s 时保留目录 ID、子树与 ACL；叶子沿用原位置',
    (hasChild) => {
      const records = hasChild
        ? [record({ apiFileId: 'doc#dir', type: 'folder' }), record({ parentDirId: 'doc#dir' })]
        : [record()];
      const collections = [legacy()];
      const before = JSON.stringify({ records, collections });
      const plan = planLegacyApiFileFolders({ records, collections, apiDatasetServer });
      expect(plan.collections[0]).toMatchObject({
        _id: 'local-doc',
        apiFileId: 'doc#dir',
        parentId: 'manual',
        type: DatasetCollectionTypeEnum.folder,
        metadata: { custom: 'keep', apiFileSourceId: 'doc', apiFileLegacyDocument: true }
      });
      expect(plan.migrations).toEqual([
        {
          collectionId: 'local-doc',
          sourceId: 'doc',
          directoryId: 'doc#dir',
          oldParentId: 'manual',
          inheritPermission: undefined
        }
      ]);
      expect(plan.permissionSources).toEqual(new Map([['doc', 'local-doc']]));
      expect(plan.transientFolderIds).toEqual(new Set(hasChild ? [] : ['doc#dir']));
      if (!hasChild) {
        expect(plan.rootParentIds.get('doc')).toBe('manual');
        expect(
          resolveApiFileRecordParent({
            record: record(),
            idMap: new Map(),
            rootParentIds: plan.rootParentIds
          }).parentId
        ).toBe('manual');
        expect(
          resolveApiFileRecordParent({
            record: record(),
            idMap: new Map(),
            rootParentIds: plan.rootParentIds,
            targetParentId: null
          })
        ).toMatchObject({ parentId: null, preserveExistingPlacement: false });
        expect(
          resolveApiFileRecordParent({
            record: record(),
            idMap: new Map(),
            rootParentIds: plan.rootParentIds,
            rootCollectionId: 'root'
          }).parentId
        ).toBe('root');
      }
      expect(JSON.stringify({ records, collections })).toBe(before);
      const retry = planLegacyApiFileFolders({
        records,
        collections: plan.collections,
        apiDatasetServer
      });
      expect(retry.migrations).toEqual([]);
      expect(retry.permissionSources).toEqual(plan.permissionSources);
      const completed = planLegacyApiFileFolders({
        records,
        collections: [...plan.collections, collection()],
        apiDatasetServer
      });
      expect(completed.permissionSources.size).toBe(0);
      expect(completed.transientFolderIds.size).toBe(0);
    }
  );
  it.each([
    undefined,
    { apiServer: { baseUrl: 'https://api.test' } },
    { yuqueServer: { userId: 'user' } },
    { feishuServer: { appId: 'app', folderToken: 'folder' } },
    { ...apiDatasetServer, apiServer: { baseUrl: 'https://api.test' } }
  ])('其他 Provider 或优先配置保持原类型冲突保护：%j', (config) => {
    const collections = [legacy()],
      records = [record()];
    const plan = planLegacyApiFileFolders({ records, collections, apiDatasetServer: config });
    expect(plan.collections).toBe(collections);
    expect(plan.records).toBe(records);
    expect(plan.migrations).toEqual([]);
  });
  it('已有来源标记的真实目录不冒充旧正文，非正文也不转换', () => {
    for (const records of [[record()], [record({ type: 'folder' })]]) {
      const existing = collection({
        type: DatasetCollectionTypeEnum.folder,
        metadata: { apiFileSourceId: 'doc' }
      });
      expect(
        planLegacyApiFileFolders({ records, collections: [existing], apiDatasetServer }).migrations
      ).toEqual([]);
    }
  });
  it.each(['local', 'remote'])('派生身份与 %s 记录冲突时在写入前拒绝', (kind) => {
    const records = [
      record(),
      ...(kind === 'remote' ? [record({ sourceId: 'doc#dir', apiFileId: 'doc#dir' })] : [])
    ];
    const collections = [
      legacy(),
      ...(kind === 'local' ? [collection({ _id: 'other', apiFileId: 'doc#dir' })] : [])
    ];
    expect(() => planLegacyApiFileFolders({ records, collections, apiDatasetServer })).toThrow(
      'Legacy API file directory identity conflicts'
    );
  });
  it('非兼容派生目录不提供权限复制来源', () => {
    const directory = collection({
      type: DatasetCollectionTypeEnum.folder,
      apiFileId: 'doc#dir',
      metadata: { apiFileSourceId: 'doc' }
    });
    expect(
      planLegacyApiFileFolders({ records: [record()], collections: [directory], apiDatasetServer })
        .permissionSources.size
    ).toBe(0);
  });
});
