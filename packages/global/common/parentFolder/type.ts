import z from 'zod';

export const ParentIdSchema = z.string().nullish();
export type ParentIdType = string | null | undefined;

export type GetPathProps = {
  sourceId?: ParentIdType;
  type: 'current' | 'parent';
};

export type ParentTreePathItemType = {
  parentId: string;
  parentName: string;
};

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
