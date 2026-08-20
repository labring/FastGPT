import type { EntityId } from '../../../../../db/types';
import type { TransactionContext } from '../../../../../db/transaction';
import type { CreateOrg } from './dto';
import type { Org, OrgMember } from './entity';

export type OrgReference = { id: EntityId; teamId: EntityId };

/** Org 业务相关的数据库无关访问合同。 */
export type OrgRepository = {
  findOrgReferencesByIds(ids: EntityId[], context?: TransactionContext): Promise<OrgReference[]>;
  createOrg(input: CreateOrg, context?: TransactionContext): Promise<Org>;
  findOrgsByIds(ids: EntityId[], context?: TransactionContext): Promise<Org[]>;
  findOrgsByTeamId(teamId: EntityId, context?: TransactionContext): Promise<Org[]>;
  findOrgsByTeamAndPathIds(
    teamId: EntityId,
    pathIds: string[],
    context?: TransactionContext
  ): Promise<Org[]>;
  findOrgById(orgId: EntityId, teamId: EntityId, context?: TransactionContext): Promise<Org | null>;
  findOrgChildren(
    org: Pick<Org, 'path' | 'pathId'>,
    teamId: EntityId,
    context?: TransactionContext
  ): Promise<Org[]>;
  findOrgMembersByTmbId(
    teamId: EntityId,
    tmbId: EntityId,
    context?: TransactionContext
  ): Promise<OrgMember[]>;
  deleteOrgsByTeamId(teamId: EntityId, context?: TransactionContext): Promise<void>;
};
