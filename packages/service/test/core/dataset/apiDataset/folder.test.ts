import { describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import {
  createApiFileFolders,
  planApiFileFolders
} from '@fastgpt/service/core/dataset/apiDataset/folder';
import type { ApiFileRecord } from '@fastgpt/service/core/dataset/apiDataset/tree';
import type { BulkInsertCollectionDoc } from '@fastgpt/service/core/dataset/collection/controller';

const folder = (id: string, parentDirId: string | null, depth: number): ApiFileRecord => ({
  sourceId: id,
  apiFileId: id,
  apiFileParentId: parentDirId,
  parentDirId,
  type: 'folder',
  depth,
  name: id
});

describe('planApiFileFolders', () => {
  it('仅对缺失目录预分配唯一 ID，已有映射保持原样', () => {
    const idMap = new Map([['existing', String(new Types.ObjectId())]]);
    const plans = planApiFileFolders({
      records: [
        folder('existing', null, 0),
        folder('new', null, 0),
        { ...folder('body', null, 0), type: 'file' }
      ],
      idMap
    });
    expect(plans.map(({ record }) => record.apiFileId)).toEqual(['new']);
    expect(plans[0].id).toBeInstanceOf(Types.ObjectId);
    expect(idMap.size).toBe(1);
  });
});

describe('createApiFileFolders', () => {
  it('父层部分失败时只展开成功分支，返回失败与跳过且不污染映射', async () => {
    const idMap = new Map<string, string>();
    // 输入逆序，必须按 depth 排序，并在父层提交后才能使用其 ID。
    const folders = planApiFileFolders({
      records: [
        folder('goodChild', 'good', 1),
        folder('badChild', 'bad', 1),
        folder('bad', null, 0),
        folder('good', null, 0)
      ],
      idMap
    });
    const onLayer = vi.fn();
    const insertFolders = vi.fn(async (docs: BulkInsertCollectionDoc[]) => {
      expect(docs.map((doc) => doc.apiFileId)).not.toContain('badChild');
      if (docs.some((doc) => doc.apiFileId === 'goodChild'))
        expect(String(docs[0].parentId)).toBe(idMap.get('good'));
      return {
        successApiFileIds: docs
          .filter((doc) => doc.apiFileId !== 'bad')
          .map((doc) => doc.apiFileId),
        failedApiFileIds: docs.filter((doc) => doc.apiFileId === 'bad').map((doc) => doc.apiFileId)
      };
    });
    const result = await createApiFileFolders({ folders, idMap, insertFolders, onLayer });
    expect(result).toEqual({
      createdIds: ['good', 'goodChild'],
      failedIds: ['bad'],
      skippedIds: ['badChild']
    });
    expect([...idMap.keys()]).toEqual(['good', 'goodChild']);
    expect(onLayer.mock.calls.map(([layer]) => layer)).toEqual([
      { depth: 0, created: 1, failed: 1, skipped: 0 },
      { depth: 1, created: 1, failed: 0, skipped: 1 }
    ]);
  });
  it('复用目标父级/同步哨兵及明确继承策略，保留真实远端来源', async () => {
    const rootCollectionId = String(new Types.ObjectId());
    const idMap = new Map<string, string>();
    const record = { ...folder('doc#dir', null, 0), sourceId: 'doc' };
    const folders = planApiFileFolders({ records: [record], idMap });
    const insertFolders = vi.fn(async (docs: BulkInsertCollectionDoc[]) => ({
      successApiFileIds: docs.map((doc) => doc.apiFileId),
      failedApiFileIds: []
    }));
    await createApiFileFolders({
      folders,
      idMap,
      rootCollectionId,
      inheritPermissionOf: () => false,
      insertFolders
    });
    expect(insertFolders.mock.calls[0][0][0]).toMatchObject({
      metadata: { apiFileSourceId: 'doc' },
      apiFileParentId: RootCollectionId,
      parentId: new Types.ObjectId(rootCollectionId),
      inheritPermission: false
    });
    const targetParentId = String(new Types.ObjectId());
    await createApiFileFolders({ folders, idMap: new Map(), targetParentId, insertFolders });
    expect(String(insertFolders.mock.calls[1][0][0].parentId)).toBe(targetParentId);
  });
  it('空计划和父级全部失败的层不执行空写入，写入异常上抛', async () => {
    const idMap = new Map<string, string>();
    const insertFolders = vi.fn();
    expect(await createApiFileFolders({ folders: [], idMap, insertFolders })).toEqual({
      createdIds: [],
      failedIds: [],
      skippedIds: []
    });
    const folders = planApiFileFolders({ records: [folder('child', 'missing', 1)], idMap });
    expect((await createApiFileFolders({ folders, idMap, insertFolders })).skippedIds).toEqual([
      'child'
    ]);
    expect(insertFolders).not.toHaveBeenCalled();
    const error = new Error('write failed');
    const roots = planApiFileFolders({ records: [folder('root', null, 0)], idMap });
    await expect(
      createApiFileFolders({
        folders: roots,
        idMap,
        insertFolders: async () => {
          throw error;
        }
      })
    ).rejects.toBe(error);
    expect(idMap.size).toBe(0);
  });
});
