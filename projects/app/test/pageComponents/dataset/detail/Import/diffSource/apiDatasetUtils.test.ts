import { describe, expect, it } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import type { GetApiDatasetSyncStateResponse } from '@fastgpt/global/openapi/core/dataset/apiDataset/api';
import {
  buildApiDatasetSyncIndex,
  buildEnteredFolderPaths,
  buildSelectionAfterDeselectAll,
  getApiDatasetItemState,
  resolveApiFileAncestorPath
} from '@/pageComponents/dataset/detail/Import/diffSource/apiDatasetUtils';

const createSyncState = (): GetApiDatasetSyncStateResponse => ({
  syncAll: false,
  collections: [
    {
      collectionId: '68ad85a7463006c963799a01',
      apiFileId: 'dir-a',
      sourceId: 'dir-a',
      name: '目录A',
      type: DatasetCollectionTypeEnum.folder,
      syncChildren: true,
      parentId: null
    },
    {
      collectionId: '68ad85a7463006c963799a02',
      apiFileId: 'dir-b',
      sourceId: 'dir-b',
      name: '暂停目录B',
      type: DatasetCollectionTypeEnum.folder,
      syncChildren: false,
      parentId: '68ad85a7463006c963799a01'
    },
    {
      collectionId: '68ad85a7463006c963799a03',
      apiFileId: 'doc-1#dir',
      sourceId: 'doc-1',
      name: '带子文档的文档',
      type: DatasetCollectionTypeEnum.folder,
      syncChildren: false,
      parentId: null
    },
    {
      collectionId: '68ad85a7463006c963799a04',
      apiFileId: 'doc-1',
      sourceId: 'doc-1',
      name: '带子文档的文档',
      type: DatasetCollectionTypeEnum.apiFile,
      syncChildren: true,
      parentId: '68ad85a7463006c963799a03'
    },
    {
      collectionId: '68ad85a7463006c963799a05',
      apiFileId: 'doc-2#dir',
      sourceId: 'doc-2',
      name: '同步中派生文档',
      type: DatasetCollectionTypeEnum.folder,
      syncChildren: true,
      parentId: null
    },
    {
      collectionId: '68ad85a7463006c963799a06',
      apiFileId: 'doc-2',
      sourceId: 'doc-2',
      name: '同步中派生文档',
      type: DatasetCollectionTypeEnum.apiFile,
      syncChildren: true,
      parentId: '68ad85a7463006c963799a05'
    },
    {
      collectionId: '68ad85a7463006c963799a07',
      apiFileId: 'plain-file',
      sourceId: 'plain-file',
      name: '普通已导入文件',
      type: DatasetCollectionTypeEnum.apiFile,
      syncChildren: true,
      parentId: null
    }
  ]
});

describe('apiDatasetUtils', () => {
  it('allows entering an already-synced parent folder so users can reach paused descendants', () => {
    const syncIndex = buildApiDatasetSyncIndex(createSyncState());
    const dirA: APIFileItemType = {
      id: 'dir-a',
      parentId: '',
      name: '目录A',
      type: 'folder',
      hasChild: true
    };

    const state = getApiDatasetItemState({
      item: dirA,
      syncIndex,
      isSelectAll: false,
      isSelected: false,
      resolvedAncestorPath: []
    });

    expect(state.isExists).toBe(true);
    expect(state.isChecked).toBe(true);
    expect(state.isPausedFolder).toBe(false);
    expect(state.canEnter).toBe(true);
  });

  it('keeps paused derived directory selectable even when its body file exists locally', () => {
    const syncIndex = buildApiDatasetSyncIndex(createSyncState());
    const docWithChildren: APIFileItemType = {
      id: 'doc-1',
      parentId: '',
      name: '带子文档的文档',
      type: 'file',
      hasChild: true
    };

    const idleState = getApiDatasetItemState({
      item: docWithChildren,
      syncIndex,
      isSelectAll: false,
      isSelected: false,
      resolvedAncestorPath: []
    });

    expect(idleState.isPausedFolder).toBe(true);
    expect(idleState.isExists).toBe(false);
    expect(idleState.isChecked).toBe(false);
    expect(idleState.isIndeterminate).toBe(true);
    expect(idleState.canSelectItem).toBe(true);
    expect(idleState.canEnter).toBe(true);

    const selectedState = getApiDatasetItemState({
      item: docWithChildren,
      syncIndex,
      isSelectAll: false,
      isSelected: true,
      resolvedAncestorPath: []
    });
    expect(selectedState.isChecked).toBe(true);
    expect(selectedState.isIndeterminate).toBe(false);
    expect(selectedState.canEnter).toBe(false);

    const syncedDerivedDoc: APIFileItemType = {
      id: 'doc-2',
      parentId: '',
      name: '同步中派生文档',
      type: 'file',
      hasChild: true
    };
    const syncedState = getApiDatasetItemState({
      item: syncedDerivedDoc,
      syncIndex,
      isSelectAll: false,
      isSelected: false,
      resolvedAncestorPath: []
    });
    expect(syncedState.isPausedFolder).toBe(false);
    expect(syncedState.isExists).toBe(true);
    expect(syncedState.isChecked).toBe(true);
    expect(syncedState.isIndeterminate).toBe(false);
    expect(syncedState.canEnter).toBe(true);
  });

  it('includes paused derived directories when deselecting from select-all', () => {
    const syncIndex = buildApiDatasetSyncIndex(createSyncState());
    const fileList: APIFileItemType[] = [
      { id: 'dir-a', parentId: '', name: '目录A', type: 'folder', hasChild: true },
      { id: 'doc-1', parentId: '', name: '带子文档的文档', type: 'file', hasChild: true },
      { id: 'doc-2', parentId: '', name: '同步中派生文档', type: 'file', hasChild: true },
      { id: 'plain-file', parentId: '', name: '普通已导入文件', type: 'file', hasChild: false },
      { id: 'new-file', parentId: '', name: '新文件', type: 'file', hasChild: false }
    ];

    const selected = buildSelectionAfterDeselectAll({
      fileList,
      excludeItemId: 'new-file',
      syncIndex,
      resolveAncestorPath: () => []
    });

    expect(selected.map((entry) => entry.file.id)).toEqual(['doc-1']);
  });

  it('rebuilds the full resolved ancestor breadcrumb when entering a nested folder from search', () => {
    const syncIndex = buildApiDatasetSyncIndex(createSyncState());
    const nestedDirC: APIFileItemType = {
      id: 'dir-c',
      parentId: 'dir-b',
      name: '子目录C',
      type: 'folder',
      hasChild: true
    };

    const resolvedAncestorPath = resolveApiFileAncestorPath({
      item: nestedDirC,
      currentParentId: '',
      currentPaths: [],
      searchKey: '子目录C',
      ancestorPathBySourceId: syncIndex.ancestorPathBySourceId
    });

    expect(resolvedAncestorPath).toEqual([
      { parentId: 'dir-a', parentName: '目录A' },
      { parentId: 'dir-b', parentName: '暂停目录B' }
    ]);

    const enteredPaths = buildEnteredFolderPaths({
      item: nestedDirC,
      resolvedAncestorPath: resolvedAncestorPath!
    });

    expect(enteredPaths).toEqual([
      { parentId: 'dir-a', parentName: '目录A' },
      { parentId: 'dir-b', parentName: '暂停目录B' },
      { parentId: 'dir-c', parentName: '子目录C' }
    ]);

    // 未知深层父级禁止选择或进入
    const unknownDeepItem: APIFileItemType = {
      id: 'dir-x',
      parentId: 'unknown-parent',
      name: '未知目录',
      type: 'folder',
      hasChild: true
    };
    const unknownAncestor = resolveApiFileAncestorPath({
      item: unknownDeepItem,
      currentParentId: '',
      currentPaths: [],
      searchKey: '未知',
      ancestorPathBySourceId: syncIndex.ancestorPathBySourceId
    });
    expect(unknownAncestor).toBeNull();
    expect(
      getApiDatasetItemState({
        item: unknownDeepItem,
        syncIndex,
        isSelectAll: false,
        isSelected: false,
        resolvedAncestorPath: unknownAncestor
      })
    ).toMatchObject({
      canSelectItem: false,
      canEnter: false
    });
  });

  it('disables entering when serverSyncAll, isSelectAll, or the folder itself is newly selected', () => {
    const syncIndex = buildApiDatasetSyncIndex(createSyncState());
    const newFolder: APIFileItemType = {
      id: 'new-dir',
      parentId: '',
      name: '新目录',
      type: 'folder',
      hasChild: true
    };

    expect(
      getApiDatasetItemState({
        item: newFolder,
        syncIndex,
        isSelectAll: false,
        isSelected: true,
        resolvedAncestorPath: []
      }).canEnter
    ).toBe(false);

    expect(
      getApiDatasetItemState({
        item: newFolder,
        syncIndex,
        isSelectAll: true,
        isSelected: false,
        resolvedAncestorPath: []
      }).canEnter
    ).toBe(false);

    expect(
      getApiDatasetItemState({
        item: newFolder,
        syncIndex: { ...syncIndex, serverSyncAll: true },
        isSelectAll: false,
        isSelected: false,
        resolvedAncestorPath: []
      }).canEnter
    ).toBe(false);
  });
});
