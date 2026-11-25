import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { GetApiDatasetSyncStateResponse } from '@fastgpt/global/openapi/core/dataset/apiDataset/api';

export type ApiDatasetSyncIndex = {
  serverSyncAll: boolean;
  existingFileIds: Set<string>;
  syncingFolderIds: Set<string>;
  pausedFolderIds: Set<string>;
  ancestorPathBySourceId: Map<string, ParentTreePathItemType[]>;
};

/**
 * 将服务端返回的 syncState 索引化，供导入弹窗计算节点同步态、暂停派生目录及祖先路径。
 * 派生目录（doc#dir）与普通目录统一按真实远端 sourceId 索引。
 */
export const buildApiDatasetSyncIndex = (
  syncState?: GetApiDatasetSyncStateResponse
): ApiDatasetSyncIndex => {
  const existingFileIds = new Set<string>();
  const syncingFolderIds = new Set<string>();
  const pausedFolderIds = new Set<string>();
  const colById = new Map<string, GetApiDatasetSyncStateResponse['collections'][number]>();
  const folderColBySourceId = new Map<
    string,
    GetApiDatasetSyncStateResponse['collections'][number]
  >();

  for (const col of syncState?.collections ?? []) {
    colById.set(col.collectionId, col);
    if (col.type === DatasetCollectionTypeEnum.folder) {
      folderColBySourceId.set(col.sourceId, col);
      if (col.syncChildren === false) {
        pausedFolderIds.add(col.sourceId);
      } else {
        syncingFolderIds.add(col.sourceId);
      }
    } else {
      existingFileIds.add(col.sourceId);
    }
  }

  const ancestorPathBySourceId = new Map<string, ParentTreePathItemType[]>();
  for (const [sourceId, folderCol] of folderColBySourceId) {
    const chain: ParentTreePathItemType[] = [];
    const seen = new Set<string>();
    let curr: typeof folderCol | undefined = folderCol;
    while (curr && !seen.has(curr.collectionId)) {
      seen.add(curr.collectionId);
      chain.unshift({
        parentId: curr.sourceId,
        parentName: curr.name || curr.sourceId
      });
      curr = curr.parentId ? colById.get(curr.parentId) : undefined;
    }
    ancestorPathBySourceId.set(sourceId, chain);
  }

  return {
    serverSyncAll: Boolean(syncState?.syncAll),
    existingFileIds,
    syncingFolderIds,
    pausedFolderIds,
    ancestorPathBySourceId
  };
};

/**
 * 解析指定条目的完整可校验祖先路径：
 * - 常规浏览或命中当前目录直属子项时，复用当前 breadcrumb 路径；
 * - 递归搜索命中深层节点时，查本地已知祖先链，未知深层目录返回 null 禁止盲挂根目录。
 */
export const resolveApiFileAncestorPath = ({
  item,
  currentParentId,
  currentPaths,
  searchKey,
  ancestorPathBySourceId
}: {
  item: APIFileItemType;
  currentParentId: string;
  currentPaths: ParentTreePathItemType[];
  searchKey: string;
  ancestorPathBySourceId: Map<string, ParentTreePathItemType[]>;
}): ParentTreePathItemType[] | null => {
  const normalizedCurrentParentId = currentParentId || '';
  const itemParentId = item.parentId || '';
  if (!searchKey.trim() || !itemParentId || itemParentId === normalizedCurrentParentId) {
    return currentPaths;
  }
  return ancestorPathBySourceId.get(itemParentId) ?? null;
};

/**
 * 计算导入列表中单条节点的勾选态与可导航态：
 * - 勾选与导航解耦：已同步父目录（或带子文档的已导入文件）仍允许展开下钻，以进入其下暂停子目录补选；
 * - 仅在整库同步、本次全选或本次已勾选该节点时禁止下钻；
 * - 派生目录状态按远端 sourceId 匹配，不限定 item.type === 'folder'：带子文档的远端 file
 *   若本地派生目录处于暂停态，即使正文已存在也视为未锁定（可选、半选态），允许重新勾选以恢复自动同步。
 */
export const getApiDatasetItemState = ({
  item,
  syncIndex,
  isSelectAll,
  isSelected,
  resolvedAncestorPath
}: {
  item: APIFileItemType;
  syncIndex: ApiDatasetSyncIndex;
  isSelectAll: boolean;
  isSelected: boolean;
  resolvedAncestorPath: ParentTreePathItemType[] | null;
}) => {
  const canHaveDerivedOrFolderState = item.type === 'folder' || Boolean(item.hasChild);
  const isPausedFolder = canHaveDerivedOrFolderState && syncIndex.pausedFolderIds.has(item.id);
  const isSyncedFolder = canHaveDerivedOrFolderState && syncIndex.syncingFolderIds.has(item.id);
  const isExists =
    syncIndex.serverSyncAll ||
    (item.type === 'folder'
      ? isSyncedFolder
      : isPausedFolder
        ? false
        : isSyncedFolder || syncIndex.existingFileIds.has(item.id));
  const canSelectItem = resolvedAncestorPath !== null;
  const isChecked = isExists || isSelected || isSelectAll;
  const isIndeterminate = isPausedFolder && !isChecked;
  const canEnter =
    Boolean(item.hasChild) &&
    !syncIndex.serverSyncAll &&
    !isSelectAll &&
    !isSelected &&
    canSelectItem;

  return {
    isPausedFolder,
    isExists,
    canSelectItem,
    isChecked,
    isIndeterminate,
    canEnter
  };
};

/**
 * 取消“全选”并反向勾选当前列表中除目标项外的所有可选项。
 * 复用 getApiDatasetItemState，保证普通暂停目录与已有正文的暂停派生目录和常规列表判定一致。
 */
export const buildSelectionAfterDeselectAll = ({
  fileList,
  excludeItemId,
  syncIndex,
  resolveAncestorPath
}: {
  fileList: APIFileItemType[];
  excludeItemId: string;
  syncIndex: ApiDatasetSyncIndex;
  resolveAncestorPath: (item: APIFileItemType) => ParentTreePathItemType[] | null;
}): { file: APIFileItemType; ancestorIds: string[] }[] => {
  const result: { file: APIFileItemType; ancestorIds: string[] }[] = [];

  for (const file of fileList) {
    if (file.id === excludeItemId) continue;
    const resolvedAncestorPath = resolveAncestorPath(file);
    const { isExists, canSelectItem } = getApiDatasetItemState({
      item: file,
      syncIndex,
      isSelectAll: false,
      isSelected: false,
      resolvedAncestorPath
    });
    if (isExists || !canSelectItem || !resolvedAncestorPath) continue;
    result.push({
      file,
      ancestorIds: resolvedAncestorPath
        .map((entry) => entry.parentId)
        .filter((id): id is string => Boolean(id))
    });
  }

  return result;
};

/** 构造展开指定节点后的完整 breadcrumb 路径，保证逐级浏览与搜索跳转共用已解析祖先链。 */
export const buildEnteredFolderPaths = ({
  item,
  resolvedAncestorPath
}: {
  item: APIFileItemType;
  resolvedAncestorPath: ParentTreePathItemType[];
}): ParentTreePathItemType[] => [
  ...resolvedAncestorPath,
  {
    parentId: item.id,
    parentName: item.name
  }
];
