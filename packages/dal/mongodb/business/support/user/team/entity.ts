import {
  TeamMemberRelationsSchema,
  TeamMemberSchema,
  TeamMemberDetailSchema,
  TeamOpenaiAccountSchema,
  TeamSchema,
  type Team,
  type TeamMember,
  type TeamMemberDetail,
  type TeamMemberRelations
} from '../../../../../business/support/user/team/entity';
import type { UserDocument } from '../schema';
import type { TeamDocument } from './schema';
import type { TeamMemberDocument } from './member/schema';
import { toEntityId } from '../../../../utils';

type TeamMemberRelationsDocument = TeamMemberDocument & {
  team?: TeamDocument;
  user?: UserDocument;
};

export const toTeam = (document: TeamDocument): Team =>
  TeamSchema.parse({
    id: toEntityId(document._id),
    name: document.name,
    ownerId: toEntityId(document.ownerId),
    avatar: document.avatar ?? undefined,
    createTime: document.createTime,
    balance: document.balance ?? undefined,
    limit: document.limit ?? undefined,
    openaiAccount: TeamOpenaiAccountSchema.safeParse(document.openaiAccount).data,
    externalWorkflowVariables: document.externalWorkflowVariables ?? undefined,
    notificationAccount: document.notificationAccount ?? undefined,
    meta: document.meta ?? undefined,
    deleteTime: document.deleteTime ?? undefined
  });

export const toTeamMember = (document: TeamMemberDocument): TeamMember =>
  TeamMemberSchema.parse({
    id: toEntityId(document._id),
    teamId: toEntityId(document.teamId),
    userId: toEntityId(document.userId),
    avatar: document.avatar ?? undefined,
    name: document.name,
    role: document.role ?? undefined,
    status: document.status ?? undefined,
    createTime: document.createTime ?? undefined,
    updateTime: document.updateTime ?? undefined
  });

export const toTeamMemberRelations = (document: TeamMemberRelationsDocument): TeamMemberRelations =>
  TeamMemberRelationsSchema.parse({
    member: toTeamMember(document),
    team: document.team ? toTeam(document.team) : undefined,
    user: document.user
      ? {
          id: toEntityId(document.user._id),
          username: document.user.username,
          contact: document.user.contact ?? undefined,
          timezone: document.user.timezone ?? 'Asia/Shanghai'
        }
      : undefined
  });

/** 将 Mongo team member 文档转换为共享 TeamMemberDetail 实体。 */
export const toTeamMemberDetail = (document: TeamMemberDocument): TeamMemberDetail =>
  TeamMemberDetailSchema.parse(toTeamMember(document));
