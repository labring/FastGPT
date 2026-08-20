import mongoose, { type Model, type Mongoose, type Query } from 'mongoose';
import type { DatabaseErrorAdapter } from '../../../../../../db';
import type { EntityId } from '../../../../../../db/types';
import type { TransactionContext } from '../../../../../../db/transaction';
import type {
  CreateOrg,
  Org,
  OrgMember,
  OrgRepository
} from '../../../../../../business/support/user/team/org';
import { MongoErrorAdapter } from '../../../../../errors';
import { getMongoSession } from '../../../../../transaction';
import { toEntityId, toMongoObjectId } from '../../../../../utils';
import {
  getOrgMemberModel,
  type OrgMemberDocument,
  type OrgMemberMongooseSchemaType
} from './member/schema';
import { getOrgModel, type OrgDocument, type OrgMongooseSchemaType } from './schema';
import { toOrg, toOrgMember } from './entity';

export class MongoOrgRepository implements OrgRepository {
  constructor(
    private readonly orgModel: Model<OrgMongooseSchemaType> = getOrgModel(mongoose),
    private readonly orgMemberModel: Model<OrgMemberMongooseSchemaType> = getOrgMemberModel(
      mongoose
    ),
    private readonly errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter()
  ) {}

  private execute<T>(handler: () => Promise<T>) {
    return this.errorAdapter.execute(handler);
  }

  private withSession<T>(query: Query<T, any>, context?: TransactionContext) {
    const session = getMongoSession(context);
    return session ? query.session(session) : query;
  }

  async findOrgReferencesByIds(
    ids: EntityId[],
    context?: TransactionContext
  ): Promise<Array<{ id: EntityId; teamId: EntityId }>> {
    if (ids.length === 0) return [];
    return this.execute(async () => {
      const documents = await this.withSession(
        this.orgModel.find({ _id: { $in: ids.map(toMongoObjectId) } }).select('_id teamId'),
        context
      ).lean<Array<{ _id: unknown; teamId: unknown }>>();
      return documents.map((document) => ({
        id: toEntityId(document._id),
        teamId: toEntityId(document.teamId)
      }));
    });
  }

  async createOrg(input: CreateOrg, context?: TransactionContext): Promise<Org> {
    return this.execute(async () => {
      const session = getMongoSession(context);
      const [document] = await this.orgModel.create([input], session ? { session } : undefined);
      return toOrg(document.toObject() as OrgDocument);
    });
  }

  async findOrgsByIds(ids: EntityId[], context?: TransactionContext): Promise<Org[]> {
    if (ids.length === 0) return [];
    return this.execute(async () => {
      const documents = await this.withSession(
        this.orgModel.find({ _id: { $in: ids.map(toMongoObjectId) } }),
        context
      ).lean<OrgDocument[]>();
      return documents.map(toOrg);
    });
  }

  async findOrgsByTeamId(teamId: EntityId, context?: TransactionContext): Promise<Org[]> {
    return this.execute(async () => {
      const documents = await this.withSession(
        this.orgModel.find({ teamId: toMongoObjectId(teamId) }),
        context
      ).lean<OrgDocument[]>();
      return documents.map(toOrg);
    });
  }

  async findOrgsByTeamAndPathIds(
    teamId: EntityId,
    pathIds: string[],
    context?: TransactionContext
  ): Promise<Org[]> {
    if (pathIds.length === 0) return [];
    return this.execute(async () => {
      const documents = await this.withSession(
        this.orgModel.find({
          teamId: toMongoObjectId(teamId),
          pathId: { $in: pathIds }
        }),
        context
      ).lean<OrgDocument[]>();
      return documents.map(toOrg);
    });
  }

  async findOrgById(
    orgId: EntityId,
    teamId: EntityId,
    context?: TransactionContext
  ): Promise<Org | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.orgModel.findOne({ _id: toMongoObjectId(orgId), teamId: toMongoObjectId(teamId) }),
        context
      ).lean<OrgDocument>();
      return document ? toOrg(document) : null;
    });
  }

  async findOrgChildren(
    org: Pick<Org, 'path' | 'pathId'>,
    teamId: EntityId,
    context?: TransactionContext
  ): Promise<Org[]> {
    return this.execute(async () => {
      const path = org.path === '' && org.pathId === '' ? '' : `${org.path}/${org.pathId}`;
      const documents = await this.withSession(
        this.orgModel.find({
          teamId: toMongoObjectId(teamId),
          path: { $regex: `^${path}` }
        }),
        context
      ).lean<OrgDocument[]>();
      return documents.map(toOrg);
    });
  }

  async findOrgMembersByTmbId(
    teamId: EntityId,
    tmbId: EntityId,
    context?: TransactionContext
  ): Promise<OrgMember[]> {
    return this.execute(async () => {
      const documents = await this.withSession(
        this.orgMemberModel.find({
          teamId: toMongoObjectId(teamId),
          tmbId: toMongoObjectId(tmbId)
        }),
        context
      ).lean<OrgMemberDocument[]>();
      return documents.map(toOrgMember);
    });
  }

  async deleteOrgsByTeamId(teamId: EntityId, context?: TransactionContext): Promise<void> {
    await this.execute(async () => {
      await this.withSession(
        this.orgMemberModel.deleteMany({ teamId: toMongoObjectId(teamId) }),
        context
      );
      await this.withSession(
        this.orgModel.deleteMany({ teamId: toMongoObjectId(teamId) }),
        context
      );
    });
  }
}

export const createMongoOrgRepository = (
  client: Mongoose,
  errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter()
) => new MongoOrgRepository(getOrgModel(client), getOrgMemberModel(client), errorAdapter);
