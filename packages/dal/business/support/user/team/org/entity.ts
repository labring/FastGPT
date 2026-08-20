import z from 'zod';
import { EntityIdSchema } from '../../../../../db/types';

export const OrgSchema = z.object({
  id: EntityIdSchema,
  teamId: EntityIdSchema,
  pathId: z.string(),
  path: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  description: z.string().optional(),
  updateTime: z.date().optional()
});
export type Org = z.infer<typeof OrgSchema>;

export const OrgMemberSchema = z.object({
  id: EntityIdSchema,
  teamId: EntityIdSchema,
  orgId: EntityIdSchema,
  tmbId: EntityIdSchema
});
export type OrgMember = z.infer<typeof OrgMemberSchema>;
