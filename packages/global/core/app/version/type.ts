import { AppResourcesSchema, AppChatConfigTypeSchema } from '../type';
import { StoreNodeItemTypeSchema } from '../../workflow/type/node';
import { StoreEdgeItemTypeSchema } from '../../workflow/type/edge';
import { WorkflowReferenceSnapshotsSchema } from '../../workflow/type/io';
import { SourceMemberSchema } from '../../../support/user/type';
import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';

export const AppVersionSchema = z.object({
  _id: ObjectIdSchema,
  tmbId: ObjectIdSchema,
  appId: ObjectIdSchema,
  time: z.coerce.date(),
  nodes: z.array(StoreNodeItemTypeSchema),
  edges: z.array(StoreEdgeItemTypeSchema),
  chatConfig: AppChatConfigTypeSchema,
  referenceSnapshots: WorkflowReferenceSnapshotsSchema.optional(),
  isPublish: z.boolean().optional(),
  isAutoSave: z.boolean().optional(),
  versionName: z.string(),
  resources: AppResourcesSchema.optional()
});
export type AppVersionSchemaType = z.infer<typeof AppVersionSchema>;

export const VersionListItemSchema = z.object({
  _id: ObjectIdSchema,
  appId: ObjectIdSchema,
  versionName: z.string(),
  time: z.coerce.date(),
  isPublish: z.boolean().optional(),
  tmbId: ObjectIdSchema,
  sourceMember: SourceMemberSchema
});
export type VersionListItemType = z.infer<typeof VersionListItemSchema>;
