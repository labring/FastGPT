import type { EntityId } from '../../../../db/types';
import type { TransactionContext } from '../../../../db/transaction';
import type {
  CreateTeam,
  CreateTeamMember,
  TeamMemberQuery,
  UpdateTeam,
  UpdateTeamLimit
} from './dto';
import type { Team, TeamMember, TeamMemberDetail, TeamMemberRelations } from './entity';

export type CreateDefaultTeamParams = {
  userId: EntityId;
  teamName?: string;
  avatar?: string;
  context?: TransactionContext;
};

export type TeamReference = { id: EntityId };
export type TeamScopedReference = TeamReference & { teamId: EntityId };

/** Team 业务相关的数据库无关访问合同。 */
export type TeamRepository = {
  findMemberById(id: EntityId, context?: TransactionContext): Promise<TeamMemberDetail | null>;
  findMemberByTeamAndUser(
    teamId: EntityId,
    userId: EntityId,
    query?: TeamMemberQuery,
    context?: TransactionContext
  ): Promise<TeamMemberDetail | null>;
  findMemberByIdInTeam(
    id: EntityId,
    teamId: EntityId,
    query?: TeamMemberQuery,
    context?: TransactionContext
  ): Promise<TeamMemberDetail | null>;
  findMemberRelationsById(
    id: EntityId,
    context?: TransactionContext
  ): Promise<TeamMemberRelations | null>;
  findMemberRelationsByUserId(
    userId: EntityId,
    context?: TransactionContext
  ): Promise<TeamMemberRelations | null>;
  findMemberRelationsByTeamId(
    teamId: EntityId,
    context?: TransactionContext
  ): Promise<TeamMemberRelations[]>;
  findOwnerByTeamId(teamId: EntityId, context?: TransactionContext): Promise<TeamMember | null>;
  findMembersByIds(
    ids: EntityId[],
    query?: TeamMemberQuery,
    context?: TransactionContext
  ): Promise<TeamMember[]>;
  findMembersByTeamId(
    teamId: EntityId,
    query?: TeamMemberQuery,
    context?: TransactionContext
  ): Promise<TeamMember[]>;
  countMembersByTeamId(
    teamId: EntityId,
    query?: TeamMemberQuery,
    context?: TransactionContext
  ): Promise<number>;
  findTeamById(teamId: EntityId, context?: TransactionContext): Promise<Team | null>;
  findTeamsByIds(teamIds: EntityId[], context?: TransactionContext): Promise<Team[]>;
  findAllTeamIds(context?: TransactionContext): Promise<EntityId[]>;
  findTeamReferencesByIds(
    teamIds: EntityId[],
    context?: TransactionContext
  ): Promise<TeamReference[]>;
  findMemberReferencesByIds(
    ids: EntityId[],
    context?: TransactionContext
  ): Promise<TeamScopedReference[]>;
  createTeam(input: CreateTeam, context?: TransactionContext): Promise<Team>;
  createTeamMember(input: CreateTeamMember, context?: TransactionContext): Promise<TeamMember>;
  updateMemberAvatar(
    id: EntityId,
    avatar: string,
    context?: TransactionContext
  ): Promise<TeamMemberDetail | null>;
  updateTeam(
    teamId: EntityId,
    patch: UpdateTeam,
    context?: TransactionContext
  ): Promise<Team | null>;
  updateTeamLimit(
    teamId: EntityId,
    patch: UpdateTeamLimit,
    context?: TransactionContext
  ): Promise<Team | null>;
  deleteMembersByTeamId(teamId: EntityId, context?: TransactionContext): Promise<void>;
  clearTeamSensitiveData(teamId: EntityId, context?: TransactionContext): Promise<Team | null>;
  /** 已存在默认成员时返回 null，创建过程中的四张表共享同一事务上下文。 */
  createDefaultTeam(params: CreateDefaultTeamParams): Promise<TeamMemberDetail | null>;
};
