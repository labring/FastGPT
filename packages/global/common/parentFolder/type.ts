import z from 'zod';

export const ParentIdSchema = z.coerce.string().nullish();
export type ParentIdType = string | null | undefined;

export const GetPathPropsSchema = z.object({
  sourceId: ParentIdSchema.optional(),
  type: z.enum(['current', 'parent']).optional()
});
export type GetPathProps = z.infer<typeof GetPathPropsSchema>;

export const ParentTreePathItemSchema = z.object({
  parentId: ParentIdSchema,
  parentName: z.string()
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
