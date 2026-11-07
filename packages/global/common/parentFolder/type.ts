import z from 'zod';

export const ParentIdSchema = z
  .preprocess(
    (value) => (value !== null && typeof value === 'object' ? String(value) : value),
    z.string().regex(/^([0-9a-fA-F]{24})?$/)
  )
  .nullish();
export type ParentIdType = string | null | undefined;

export const FolderAccessModeSchema = z.enum(['read', 'navigate']).meta({
  description: '目录访问方式：read 表示真实读取权限，navigate 仅表示可通过可读后代浏览'
});
export type FolderAccessMode = z.infer<typeof FolderAccessModeSchema>;

export const GetPathPropsSchema = z.object({
  sourceId: ParentIdSchema.optional(),
  type: z.enum(['current', 'parent']).optional()
});
export type GetPathProps = z.infer<typeof GetPathPropsSchema>;

export const ParentTreePathItemSchema = z.object({
  parentId: ParentIdSchema,
  parentName: z.string(),
  folderAccessMode: FolderAccessModeSchema.optional()
});
export type ParentTreePathItemType = z.infer<typeof ParentTreePathItemSchema>;

export const GetResourceFolderListPropsSchema = z.object({
  parentId: ParentIdSchema
});
export type GetResourceFolderListProps = z.infer<typeof GetResourceFolderListPropsSchema>;

export const GetResourceFolderListItemResponseSchema = z.object({
  name: z.string(),
  id: z.string()
});
export type GetResourceFolderListItemResponse = z.infer<
  typeof GetResourceFolderListItemResponseSchema
>;

export const GetResourceListItemResponseSchema = GetResourceFolderListItemResponseSchema.extend({
  avatar: z.string(),
  isFolder: z.boolean()
});
export type GetResourceListItemResponse = z.infer<typeof GetResourceListItemResponseSchema>;
