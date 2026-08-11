import mongoose, { type Model, type Mongoose, type Query } from 'mongoose';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import type { DatabaseErrorAdapter } from '../../db';
import type { TeamMemberDetail } from '../../domain/team';
import type { EntityId } from '../../domain/types';
import type { CreateDefaultTeamParams, TeamRepository } from '../../ports/team.repository';
import type { TransactionContext } from '../../transaction';
import { toTeamMemberDetail } from '../mappers/team';
import { MongoErrorAdapter } from '../errors';
import { getMemberGroupModel, type MemberGroupMongooseSchemaType } from '../models/memberGroup';
import { getOrgModel, type OrgMongooseSchemaType } from '../models/org';
import { getTeamModel, type TeamMongooseSchemaType } from '../models/team';
import {
  getTeamMemberModel,
  type TeamMemberDocument,
  type TeamMemberMongooseSchemaType
} from '../models/teamMember';
import { getMongoSession } from '../transaction';
import { toMongoObjectId } from '../utils';

export class MongoTeamRepository implements TeamRepository {
  constructor(
    private readonly teamModel: Model<TeamMongooseSchemaType> = getTeamModel(mongoose),
    private readonly teamMemberModel: Model<TeamMemberMongooseSchemaType> = getTeamMemberModel(
      mongoose
    ),
    private readonly memberGroupModel: Model<MemberGroupMongooseSchemaType> = getMemberGroupModel(
      mongoose
    ),
    private readonly orgModel: Model<OrgMongooseSchemaType> = getOrgModel(mongoose),
    private readonly errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter()
  ) {}

  private execute<T>(handler: () => Promise<T>) {
    return this.errorAdapter.execute(handler);
  }

  private withSession<T>(
    query: Query<T, TeamMemberMongooseSchemaType>,
    context?: TransactionContext
  ) {
    const session = getMongoSession(context);
    return session ? query.session(session) : query;
  }

  async findMemberById(
    id: EntityId,
    context?: TransactionContext
  ): Promise<TeamMemberDetail | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.teamMemberModel.findById(toMongoObjectId(id)),
        context
      ).lean<TeamMemberDocument>();
      return document ? toTeamMemberDetail(document) : null;
    });
  }

  async updateMemberAvatar(
    id: EntityId,
    avatar: string,
    context?: TransactionContext
  ): Promise<TeamMemberDetail | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.teamMemberModel.findByIdAndUpdate(
          toMongoObjectId(id),
          { $set: { avatar } },
          { new: true }
        ),
        context
      ).lean<TeamMemberDocument>();
      return document ? toTeamMemberDetail(document) : null;
    });
  }

  async createDefaultTeam({
    userId,
    teamName = 'My Team',
    avatar = '/icon/logo.svg',
    context
  }: CreateDefaultTeamParams): Promise<TeamMemberDetail | null> {
    return this.execute(async () => {
      const session = getMongoSession(context);
      const sessionOptions = session ? { session, ordered: true } : undefined;

      // 已存在默认 tmb 时沿用旧语义：跳过创建。
      const existing = await (
        session
          ? this.teamMemberModel.findOne({ userId: toMongoObjectId(userId) }).session(session)
          : this.teamMemberModel.findOne({ userId: toMongoObjectId(userId) })
      ).lean();
      if (existing) return null;

      const [teamDocument] = await this.teamModel.create(
        [
          {
            ownerId: userId,
            name: teamName,
            avatar,
            createTime: new Date()
          }
        ],
        sessionOptions
      );
      const [tmbDocument] = await this.teamMemberModel.create(
        [
          {
            teamId: teamDocument._id,
            userId,
            name: 'Owner',
            role: TeamMemberRoleEnum.owner,
            status: TeamMemberStatusEnum.active,
            createTime: new Date()
          }
        ],
        sessionOptions
      );
      await this.memberGroupModel.create(
        [
          {
            teamId: tmbDocument.teamId,
            name: DefaultGroupName,
            avatar
          }
        ],
        sessionOptions
      );
      await this.orgModel.create(
        [
          {
            teamId: tmbDocument.teamId,
            name: 'ROOT',
            path: ''
          }
        ],
        sessionOptions
      );

      return toTeamMemberDetail(tmbDocument.toObject() as TeamMemberDocument);
    });
  }
}

export const createMongoTeamRepository = (
  client: Mongoose,
  errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter()
) =>
  new MongoTeamRepository(
    getTeamModel(client),
    getTeamMemberModel(client),
    getMemberGroupModel(client),
    getOrgModel(client),
    errorAdapter
  );
