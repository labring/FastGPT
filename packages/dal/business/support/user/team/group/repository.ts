import type { EntityId } from '../../../../../db/types';
import type { TransactionContext } from '../../../../../db/transaction';
import type { CreateMemberGroup } from './dto';
import type { GroupMember, MemberGroup } from './entity';

export type GroupReference = { id: EntityId; teamId: EntityId };

/** Group 业务相关的数据库无关访问合同。 */
export type GroupRepository = {
  findMemberGroupReferencesByIds(
    ids: EntityId[],
    context?: TransactionContext
  ): Promise<GroupReference[]>;
  createMemberGroup(input: CreateMemberGroup, context?: TransactionContext): Promise<MemberGroup>;
  findMemberGroupsByIds(ids: EntityId[], context?: TransactionContext): Promise<MemberGroup[]>;
  findGroupsByTmbId(
    teamId: EntityId,
    tmbId: EntityId,
    roles?: string[],
    context?: TransactionContext
  ): Promise<MemberGroup[]>;
  findGroupMember(
    groupId: EntityId,
    tmbId: EntityId,
    context?: TransactionContext
  ): Promise<GroupMember | null>;
  findGroupMembersByGroupId(
    groupId: EntityId,
    context?: TransactionContext
  ): Promise<GroupMember[]>;
  findMemberGroupByTeamAndName(
    teamId: EntityId,
    name: string,
    context?: TransactionContext
  ): Promise<MemberGroup | null>;
  updateMemberGroupAvatar(
    teamId: EntityId,
    name: string,
    avatar: string,
    context?: TransactionContext
  ): Promise<MemberGroup | null>;
  deleteMemberGroupsByTeamId(teamId: EntityId, context?: TransactionContext): Promise<void>;
};
