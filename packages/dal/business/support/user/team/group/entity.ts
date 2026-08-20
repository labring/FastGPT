import z from 'zod';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { EntityIdSchema } from '../../../../../db/types';

export const MemberGroupSchema = z.object({
  id: EntityIdSchema,
  teamId: EntityIdSchema,
  name: z.string(),
  avatar: z.string().optional(),
  updateTime: z.date().optional()
});
export type MemberGroup = z.infer<typeof MemberGroupSchema>;

export const GroupMemberSchema = z.object({
  id: EntityIdSchema,
  groupId: EntityIdSchema,
  tmbId: EntityIdSchema,
  role: z.enum(GroupMemberRole)
});
export type GroupMember = z.infer<typeof GroupMemberSchema>;
