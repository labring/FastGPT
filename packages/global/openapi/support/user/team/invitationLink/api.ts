import z from 'zod';
import { TeamMemberNameSchema } from '../../../../../support/user/team/memberName';

export const InvitationLinkInfoQuerySchema = z.object({
  linkId: z.string().min(1).meta({ description: '邀请链接 ID', example: 'invite-link-id' })
});
export type InvitationLinkInfoQueryType = z.infer<typeof InvitationLinkInfoQuerySchema>;

export const AcceptInvitationWithMemberNameBodySchema = z.object({
  linkId: z.string().min(1).meta({ description: '邀请链接 ID', example: 'invite-link-id' }),
  memberName: TeamMemberNameSchema.meta({ description: '目标团队成员名', example: '张三' })
});
export type AcceptInvitationWithMemberNameBodyType = z.infer<
  typeof AcceptInvitationWithMemberNameBodySchema
>;

export const AcceptInvitationWithMemberNameResponseSchema = z.object({
  teamId: z.string().meta({ description: '目标团队 ID', example: 'team-id' }),
  tmbId: z.string().meta({ description: '目标团队成员 ID', example: 'tmb-id' })
});
export type AcceptInvitationWithMemberNameResponseType = z.infer<
  typeof AcceptInvitationWithMemberNameResponseSchema
>;
