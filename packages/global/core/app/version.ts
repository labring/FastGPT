import { AppSchemaTypeSchema } from './type';
import { SourceMemberSchema } from '../../support/user/type';
import z from 'zod';
import { ObjectIdSchema } from '../../common/type/mongo';

export const AppVersionSchema = z.object({
  _id: ObjectIdSchema,
  tmbId: ObjectIdSchema,
  appId: ObjectIdSchema,
  time: z.date(),
  nodes: AppSchemaTypeSchema.shape.modules,
  edges: AppSchemaTypeSchema.shape.edges,
  chatConfig: AppSchemaTypeSchema.shape.chatConfig,
  isPublish: z.boolean().optional(),
  isAutoSave: z.boolean().optional(),
  versionName: z.string()
});
export type AppVersionSchemaType = z.infer<typeof AppVersionSchema>;

export const VersionListItemSchema = z.object({
  _id: ObjectIdSchema,
  appId: ObjectIdSchema,
  versionName: z.string(),
  time: z.date(),
  isPublish: z.boolean().optional(),
  tmbId: ObjectIdSchema,
  sourceMember: SourceMemberSchema
});
export type VersionListItemType = z.infer<typeof VersionListItemSchema>;
