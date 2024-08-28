export type ParentTreePathItemType = {
  parentId: string;
  parentName: string;
};
export type ParentIdType = string | null | undefined;

export type GetResourceFolderListProps = {
  parentId: ParentIdType;
};
export type GetResourceFolderListItemResponse = {
  name: string;
  id: string;
};

export type GetResourceListItemResponse = GetResourceFolderListItemResponse & {
  avatar: string;
  isFolder: boolean;
};
