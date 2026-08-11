import type { TeamMemberDetail } from '../domain/team';
import type { EntityId } from '../domain/types';
import type { TransactionContext } from '../transaction';

export type CreateDefaultTeamParams = {
  userId: EntityId;
  teamName?: string;
  avatar?: string;
  context?: TransactionContext;
};

/**
 * Team/TeamMember 最小 DAL 能力，只覆盖 M9 三个迁移流程需要的操作。
 * 权限、组织等复杂读模型仍留在 service 层（事务外读取）。
 */
export type TeamRepository = {
  findMemberById(id: EntityId, context?: TransactionContext): Promise<TeamMemberDetail | null>;
  updateMemberAvatar(
    id: EntityId,
    avatar: string,
    context?: TransactionContext
  ): Promise<TeamMemberDetail | null>;
  /**
   * 在事务内创建默认团队（teams + team_members + team_member_groups + team_orgs）。
   * 已存在默认 tmb 时返回 null（沿用旧语义：跳过创建）。
   */
  createDefaultTeam(params: CreateDefaultTeamParams): Promise<TeamMemberDetail | null>;
};
