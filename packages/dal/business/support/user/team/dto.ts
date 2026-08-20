import z from 'zod';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { EntityIdSchema } from '../../../../db/types';
import { TeamOpenaiAccountSchema } from './entity';

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

export const UpdateTeamSchema = z.object({
  name: z.string().optional(),
  avatar: z.string().optional(),
  openaiAccount: TeamOpenaiAccountSchema.optional(),
  clearOpenaiAccount: z.boolean().optional(),
  externalWorkflowVariable: z
    .object({
      key: z.string().min(1),
      value: z.string()
    })
    .optional()
});
export type UpdateTeam = z.infer<typeof UpdateTeamSchema>;

export const UpdateTeamLimitSchema = z.object({
  lastExportDatasetTime: z.date().nullable().optional(),
  lastWebsiteSyncTime: z.date().nullable().optional()
});
export type UpdateTeamLimit = z.infer<typeof UpdateTeamLimitSchema>;

export const TeamMemberQuerySchema = z.object({
  teamId: EntityIdSchema.optional(),
  includeLeft: z.boolean().optional()
});
export type TeamMemberQuery = z.infer<typeof TeamMemberQuerySchema>;
