import { describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import {
  buildApiFileSyncPlan,
  selectApiFileSyncDeletes
} from '@fastgpt/service/core/dataset/apiDataset/syncPlan';
import type { ApiFileRecord } from '@fastgpt/service/core/dataset/apiDataset/tree';
import type { ApiFileLocalCollection } from '@fastgpt/service/core/dataset/apiDataset/utils';

const local = (
  apiFileId?: string,
  fields: Partial<ApiFileLocalCollection & { name: string }> = {}
) => ({
  _id: new Types.ObjectId(),
  name: apiFileId ?? 'manual',
  type: DatasetCollectionTypeEnum.folder,
  apiFileId,
  parentId: null,
  ...fields
});
const record = (apiFileId: string, fields: Partial<ApiFileRecord> = {}): ApiFileRecord => ({
  apiFileId,
  sourceId: apiFileId,
  apiFileParentId: null,
  parentDirId: null,
  depth: 0,
  type: 'folder',
  name: apiFileId,
  ...fields
});

describe('buildApiFileSyncPlan', () => {
  it('一次计算目录、文件、改名、移动、删除与内容候选，规划不修改输入或已提交映射', () => {
    const root = local(RootCollectionId);
    const manual = local();
    const oldFolder = local('oldFolder', { parentId: root._id });
    const oldFile = local('oldFile', {
      type: DatasetCollectionTypeEnum.apiFile,
      parentId: oldFolder._id,
      apiFileParentId: 'oldFolder',
      inheritPermission: true
    });
    const gone = local('gone', { parentId: root._id });
    const collections = [root, manual, oldFolder, oldFile, gone];
    const records = [
      record('newFolder'),
      record('oldFolder', { name: 'folder renamed' }),
      record('oldFile', {
        type: 'file',
        name: 'file renamed',
        apiFileParentId: 'newFolder',
        parentDirId: 'newFolder',
        depth: 1
      }),
      record('newFile', { type: 'file', parentDirId: 'newFolder', depth: 1 })
    ];
    const before = JSON.stringify({ collections, records });
    const plan = buildApiFileSyncPlan({ collections, records });
    const newFolderId = String(plan.folders[0].id);
    expect(JSON.stringify({ collections, records })).toBe(before);
    expect(plan.idMap.has('newFolder')).toBe(false);
    expect(plan.rootCollectionId).toBe(String(root._id));
    expect(plan.missingFiles.map((item) => item.apiFileId)).toEqual(['newFile']);
    expect(plan.existingFileIds).toEqual(['oldFile']);
    expect(plan.existingCount).toBe(2);
    expect(plan.renames.map((item) => [item.apiFileId, item.name])).toEqual([
      ['oldFolder', 'folder renamed'],
      ['oldFile', 'file renamed']
    ]);
    expect(plan.parentUpdates).toContainEqual(
      expect.objectContaining({
        _id: String(oldFile._id),
        oldParentId: String(oldFolder._id),
        newParentId: newFolderId,
        apiFileParentId: 'newFolder',
        inheritPermission: true
      })
    );
    expect(plan.parentChanges).toContainEqual({ id: newFolderId, parentId: String(root._id) });
    expect(plan.deleteCandidates).toEqual([gone]);
  });

  it('导入根文档新增子级时预规划派生目录和正文移动，局部根保持用户位置', () => {
    const manual = local();
    const body = local('doc', { type: DatasetCollectionTypeEnum.apiFile, parentId: manual._id });
    const plan = buildApiFileSyncPlan({
      collections: [manual, body],
      records: [
        record('doc#dir', { sourceId: 'doc' }),
        record('doc', { type: 'file', parentDirId: 'doc#dir', depth: 1 }),
        record('child', { type: 'file', parentDirId: 'doc#dir', apiFileParentId: 'doc', depth: 1 })
      ]
    });
    expect(plan.rootCollectionId).toBeUndefined();
    expect(plan.parentChanges).toEqual([
      { id: String(plan.folders[0].id), parentId: null },
      { id: String(body._id), parentId: String(plan.folders[0].id) }
    ]);
    expect(plan.existingFileIds).toEqual(['doc']);
    expect(plan.missingFiles.map((item) => item.apiFileId)).toEqual(['child']);
    const unchanged = buildApiFileSyncPlan({
      collections: [manual, body],
      records: [record('doc', { type: 'file' })]
    });
    expect(unchanged.parentChanges).toEqual([]);
    expect(unchanged.renames).toEqual([]);
  });

  it.each([
    ['folder', DatasetCollectionTypeEnum.apiFile],
    ['file', DatasetCollectionTypeEnum.folder]
  ] as const)('拒绝远端 %s 与本地类型不匹配', (type, localType) => {
    expect(() =>
      buildApiFileSyncPlan({
        records: [record('conflict', { type })],
        collections: [local('conflict', { type: localType })]
      })
    ).toThrow('Api file record type conflicts with existing collection: apiFileId=conflict');
  });

  it('计划缺失父目录时立即报错，空计划不产生操作', () => {
    expect(() =>
      buildApiFileSyncPlan({
        records: [record('child', { parentDirId: 'missing' })],
        collections: []
      })
    ).toThrow('Missing API file parent: child');
    const plan = buildApiFileSyncPlan({ records: [], collections: [] });
    expect(plan.idMap.size).toBe(0);
    for (const field of [
      'folders',
      'missingFiles',
      'existingFileIds',
      'renames',
      'parentUpdates',
      'parentChanges',
      'deleteCandidates'
    ] as const)
      expect(plan[field]).toEqual([]);
  });
});

describe('selectApiFileSyncDeletes', () => {
  it('实际移动成功后允许清理旧目录，移动失败时保留整条祖先链', () => {
    const ancestor = local('ancestor');
    const old = local('old', { parentId: ancestor._id });
    const retained = local('retained', {
      parentId: old._id,
      type: DatasetCollectionTypeEnum.apiFile
    });
    const gone = local('gone');
    const candidates = [ancestor, old, gone];
    expect(
      selectApiFileSyncDeletes({ candidates, collections: [ancestor, old, retained, gone] })
    ).toEqual([gone]);
    expect(
      selectApiFileSyncDeletes({
        candidates,
        collections: [ancestor, old, { ...retained, parentId: null }, gone]
      })
    ).toEqual(candidates);
  });

  it('用户目录和本轮新增节点同样保护仍引用的删除候选，多个引用共享祖先遍历', () => {
    const old = local('old');
    const manual = local(undefined, { parentId: old._id });
    const created = local('created', { parentId: old._id });
    expect(
      selectApiFileSyncDeletes({ candidates: [old], collections: [old, manual, created] })
    ).toEqual([]);
  });

  it('重建后的新 ID、已消失候选及 ID 被复用为其他远端身份均不能误删', () => {
    const old = local('old');
    const replaced = local('old');
    expect(selectApiFileSyncDeletes({ candidates: [old], collections: [replaced] })).toEqual([]);
    expect(selectApiFileSyncDeletes({ candidates: [old], collections: [] })).toEqual([]);
    expect(
      selectApiFileSyncDeletes({
        candidates: [old],
        collections: [{ ...old, apiFileId: 'different' }]
      })
    ).toEqual([]);
  });

  it('历史环和缺失父级不导致无限遍历，纯删除子树无需保护', () => {
    const a = local('a');
    const b = local('b', { parentId: a._id });
    a.parentId = b._id;
    const manual = local(undefined, { parentId: a._id });
    const orphan = local(undefined, { parentId: 'missing' });
    expect(
      selectApiFileSyncDeletes({ candidates: [a, b], collections: [a, b, manual, orphan] })
    ).toEqual([]);
    expect(selectApiFileSyncDeletes({ candidates: [a, b], collections: [a, b] })).toEqual([a, b]);
  });

  it('正文创建失败时保留其派生目录和祖先，正文成功后允许删除临时目录', () => {
    const ancestor = local('ancestor');
    const directory = local('doc#dir', {
      parentId: ancestor._id,
      metadata: { apiFileSourceId: 'doc' }
    });
    const candidates = [ancestor, directory];
    expect(
      selectApiFileSyncDeletes({
        candidates,
        collections: candidates,
        expectedFileIds: new Set(['doc'])
      })
    ).toEqual([]);
    const body = local('doc', { type: DatasetCollectionTypeEnum.apiFile, parentId: null });
    expect(
      selectApiFileSyncDeletes({
        candidates,
        collections: [...candidates, body],
        expectedFileIds: new Set(['doc'])
      })
    ).toEqual(candidates);
  });
  it('万层祖先链以迭代方式保护，输入保持不变', () => {
    const collections = Array.from({ length: 10000 }, (_, i) => ({
      _id: String(i),
      apiFileId: String(i),
      type: DatasetCollectionTypeEnum.folder,
      parentId: i ? String(i - 1) : null
    }));
    const before = JSON.stringify(collections);
    expect(
      selectApiFileSyncDeletes({
        candidates: collections,
        collections: [...collections, local(undefined, { parentId: '9999' })]
      })
    ).toEqual([]);
    expect(JSON.stringify(collections)).toBe(before);
  });
});
