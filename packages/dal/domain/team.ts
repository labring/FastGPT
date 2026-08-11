import z from 'zod';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { EntityIdSchema } from './types';

/** 默认团队/头像更新的最小 tmb 形状，只暴露当前三个流程需要的字段。 */
export const TeamMemberDetailSchema = z.object({
  id: EntityIdSchema,
  teamId: EntityIdSchema,
  userId: EntityIdSchema,
  avatar: z.string().optional(),
  name: z.string(),
  role: z.string().optional(),
  status: z.string().optional()
});
export type TeamMemberDetail = z.infer<typeof TeamMemberDetailSchema>;

export const CreateTeamSchema = z.object({
  ownerId: EntityIdSchema,
  name: z.string(),
  avatar: z.string(),
  createTime: z.date().optional()
});
export type CreateTeam = z.infer<typeof CreateTeamSchema>;

export const CreateTeamMemberSchema = z.object({
  teamId: EntityIdSchema,
  userId: EntityIdSchema,
  name: z.string(),
  role: z.enum(TeamMemberRoleEnum),
  status: z.enum(TeamMemberStatusEnum),
  createTime: z.date().optional()
});
export type CreateTeamMember = z.infer<typeof CreateTeamMemberSchema>;

export const CreateMemberGroupSchema = z.object({
  teamId: EntityIdSchema,
  name: z.string(),
  avatar: z.string()
});
export type CreateMemberGroup = z.infer<typeof CreateMemberGroupSchema>;

export const CreateOrgSchema = z.object({
  teamId: EntityIdSchema,
  name: z.string(),
  path: z.string()
});
export type CreateOrg = z.infer<typeof CreateOrgSchema>;
