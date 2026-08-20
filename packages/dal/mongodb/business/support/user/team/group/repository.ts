import mongoose, { type Model, type Mongoose, type Query } from 'mongoose';
import type { DatabaseErrorAdapter } from '../../../../../../db';
import type { EntityId } from '../../../../../../db/types';
import type { TransactionContext } from '../../../../../../db/transaction';
import type {
  CreateMemberGroup,
  GroupMember,
  GroupRepository,
  MemberGroup
} from '../../../../../../business/support/user/team/group';
import { MongoErrorAdapter } from '../../../../../errors';
import { getMongoSession } from '../../../../../transaction';
import { toEntityId, toMongoObjectId } from '../../../../../utils';
import {
  getGroupMemberModel,
  type GroupMemberDocument,
  type GroupMemberMongooseSchemaType
} from './member/schema';
import {
  getMemberGroupModel,
  type MemberGroupDocument,
  type MemberGroupMongooseSchemaType
} from './schema';
import { toGroupMember, toMemberGroup } from './entity';

export class MongoGroupRepository implements GroupRepository {
  constructor(
    private readonly memberGroupModel: Model<MemberGroupMongooseSchemaType> = getMemberGroupModel(
      mongoose
    ),
    private readonly groupMemberModel: Model<GroupMemberMongooseSchemaType> = getGroupMemberModel(
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

  async findMemberGroupReferencesByIds(
    ids: EntityId[],
    context?: TransactionContext
  ): Promise<Array<{ id: EntityId; teamId: EntityId }>> {
    if (ids.length === 0) return [];
    return this.execute(async () => {
      const documents = await this.withSession(
        this.memberGroupModel.find({ _id: { $in: ids.map(toMongoObjectId) } }).select('_id teamId'),
        context
      ).lean<Array<{ _id: unknown; teamId: unknown }>>();
      return documents.map((document) => ({
        id: toEntityId(document._id),
        teamId: toEntityId(document.teamId)
      }));
    });
  }

  async createMemberGroup(
    input: CreateMemberGroup,
    context?: TransactionContext
  ): Promise<MemberGroup> {
    return this.execute(async () => {
      const session = getMongoSession(context);
      const [document] = await this.memberGroupModel.create(
        [input],
        session ? { session } : undefined
      );
      return toMemberGroup(document.toObject() as MemberGroupDocument);
    });
  }

  async findMemberGroupsByIds(
    ids: EntityId[],
    context?: TransactionContext
  ): Promise<MemberGroup[]> {
    if (ids.length === 0) return [];
    return this.execute(async () => {
      const documents = await this.withSession(
        this.memberGroupModel.find({ _id: { $in: ids.map(toMongoObjectId) } }),
        context
      ).lean<MemberGroupDocument[]>();
      return documents.map(toMemberGroup);
    });
  }

  async findGroupsByTmbId(
    teamId: EntityId,
    tmbId: EntityId,
    roles?: string[],
    context?: TransactionContext
  ): Promise<MemberGroup[]> {
    return this.execute(async () => {
      const members = await this.withSession(
        this.groupMemberModel.find({
          tmbId: toMongoObjectId(tmbId),
          ...(roles?.length ? { role: { $in: roles } } : {})
        }),
        context
      ).lean<GroupMemberDocument[]>();
      const groupIds = members.map((member) => member.groupId);
      if (groupIds.length === 0) return [];

      const groups = await this.withSession(
        this.memberGroupModel.find({
          _id: { $in: groupIds },
          teamId: toMongoObjectId(teamId)
        }),
        context
      ).lean<MemberGroupDocument[]>();
      return groups.map(toMemberGroup);
    });
  }

  async findGroupMember(
    groupId: EntityId,
    tmbId: EntityId,
    context?: TransactionContext
  ): Promise<GroupMember | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.groupMemberModel.findOne({
          groupId: toMongoObjectId(groupId),
          tmbId: toMongoObjectId(tmbId)
        }),
        context
      ).lean<GroupMemberDocument>();
      return document ? toGroupMember(document) : null;
    });
  }

  async findGroupMembersByGroupId(
    groupId: EntityId,
    context?: TransactionContext
  ): Promise<GroupMember[]> {
    return this.execute(async () => {
      const documents = await this.withSession(
        this.groupMemberModel.find({ groupId: toMongoObjectId(groupId) }),
        context
      ).lean<GroupMemberDocument[]>();
      return documents.map(toGroupMember);
    });
  }

  async findMemberGroupByTeamAndName(
    teamId: EntityId,
    name: string,
    context?: TransactionContext
  ): Promise<MemberGroup | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.memberGroupModel.findOne({ teamId: toMongoObjectId(teamId), name }),
        context
      ).lean<MemberGroupDocument>();
      return document ? toMemberGroup(document) : null;
    });
  }

  async updateMemberGroupAvatar(
    teamId: EntityId,
    name: string,
    avatar: string,
    context?: TransactionContext
  ): Promise<MemberGroup | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.memberGroupModel.findOneAndUpdate(
          { teamId: toMongoObjectId(teamId), name },
          { $set: { avatar } },
          { new: true }
        ),
        context
      ).lean<MemberGroupDocument>();
      return document ? toMemberGroup(document) : null;
    });
  }

  async deleteMemberGroupsByTeamId(teamId: EntityId, context?: TransactionContext): Promise<void> {
    await this.execute(async () => {
      const groups = await this.withSession(
        this.memberGroupModel.find({ teamId: toMongoObjectId(teamId) }).select('_id'),
        context
      ).lean<Array<{ _id: unknown }>>();
      const groupIds = groups.map((group) => group._id);
      if (groupIds.length > 0) {
        await this.withSession(
          this.groupMemberModel.deleteMany({ groupId: { $in: groupIds } }),
          context
        );
      }
      await this.withSession(
        this.memberGroupModel.deleteMany({ teamId: toMongoObjectId(teamId) }),
        context
      );
    });
  }
}

export const createMongoGroupRepository = (
  client: Mongoose,
  errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter()
) =>
  new MongoGroupRepository(getMemberGroupModel(client), getGroupMemberModel(client), errorAdapter);
