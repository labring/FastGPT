import { getVisibleChildFolderId } from './ancestorIds';

export type VisibleFolderAccessMode = 'read' | 'navigate';
type VisibleFolder = {
  _id: string;
  parentId: string | null;
  ancestorIds?: string[];
  type: string;
};
type VisibleResource = {
  _id: string;
  parentId: string | null;
  type: string;
};
type VisibleChild = {
  id: string;
  folderAccessMode?: VisibleFolderAccessMode;
};

/**
 * 合并直接可读资源与通往可读后代的首层文件夹。
 * 调用方传入前必须应用团队、删除、创建者、搜索和 ACL 过滤条件。
 */
export const getVisibleChildren = ({
  currentFolderId,
  readableResources,
  folders,
  folderTypes,
  includedFolderTypes
}: {
  currentFolderId: string | null;
  readableResources: VisibleResource[];
  folders: VisibleFolder[];
  folderTypes: readonly string[];
  includedFolderTypes: readonly string[];
}): VisibleChild[] => {
  const folderById = new Map(folders.map((folder) => [folder._id, folder]));
  const readableIds = new Set(readableResources.map(({ _id }) => _id));
  const visible = new Map<string, VisibleChild>();
  const includeFolder = (id: string) => {
    const folder = folderById.get(id);
    if (!folder || !includedFolderTypes.includes(folder.type)) return;
    const accessMode: VisibleFolderAccessMode = readableIds.has(id) ? 'read' : 'navigate';
    const existing = visible.get(id);
    if (existing?.folderAccessMode === 'read') return;
    visible.set(id, { id, folderAccessMode: accessMode });
  };

  for (const resource of readableResources) {
    const isFolder = folderTypes.includes(resource.type);
    if (resource.parentId === currentFolderId) {
      visible.set(resource._id, {
        id: resource._id,
        ...(isFolder ? { folderAccessMode: 'read' as const } : {})
      });
      continue;
    }

    if (isFolder) {
      const folder = folderById.get(resource._id);
      if (!folder) continue;
      const childId = getVisibleChildFolderId({
        folderId: folder._id,
        ancestorIds: folder.ancestorIds ?? [],
        currentFolderId
      });
      if (childId) includeFolder(childId);
      continue;
    }

    if (!resource.parentId || resource.parentId === currentFolderId) continue;
    const parentFolder = folderById.get(resource.parentId);
    if (!parentFolder) continue;
    const childId = getVisibleChildFolderId({
      folderId: parentFolder._id,
      ancestorIds: parentFolder.ancestorIds ?? [],
      currentFolderId
    });
    if (childId) includeFolder(childId);
  }

  return Array.from(visible.values());
};
