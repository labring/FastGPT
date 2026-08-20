import z from 'zod';
import { EntityIdSchema } from '../../../../db/types';

export const TeamOpenaiAccountSchema = z.object({
  key: z.string(),
  baseUrl: z.string()
});
export type TeamOpenaiAccount = z.infer<typeof TeamOpenaiAccountSchema>;

export const TeamSchema = z.object({
  id: EntityIdSchema,
  name: z.string(),
  ownerId: EntityIdSchema,
  avatar: z.string().optional(),
  createTime: z.date(),
  balance: z.number().optional(),
  limit: z
    .object({
      lastExportDatasetTime: z.date().optional(),
      lastWebsiteSyncTime: z.date().optional()
    })
    .optional(),
  openaiAccount: TeamOpenaiAccountSchema.optional(),
  externalWorkflowVariables: z.record(z.string(), z.string()).optional(),
  notificationAccount: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  deleteTime: z.date().optional()
});
export type Team = z.infer<typeof TeamSchema>;

export const TeamMemberSchema = z.object({
  id: EntityIdSchema,
  teamId: EntityIdSchema,
  userId: EntityIdSchema,
  avatar: z.string().optional(),
  name: z.string(),
  role: z.string().optional(),
  status: z.string().optional(),
  createTime: z.date().optional(),
  updateTime: z.date().optional()
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const TeamMemberUserSummarySchema = z.object({
  id: EntityIdSchema,
  username: z.string(),
  contact: z.string().optional(),
  timezone: z.string()
});
export type TeamMemberUserSummary = z.infer<typeof TeamMemberUserSummarySchema>;

export const TeamMemberRelationsSchema = z.object({
  member: TeamMemberSchema,
  team: TeamSchema,
  user: TeamMemberUserSummarySchema.optional()
});
export type TeamMemberRelations = z.infer<typeof TeamMemberRelationsSchema>;

/** 默认团队和头像流程对外使用的最小团队成员实体。 */
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
