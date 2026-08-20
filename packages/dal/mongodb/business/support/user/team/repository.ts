import mongoose, { type Model, type Mongoose, type Query } from 'mongoose';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import type { DatabaseErrorAdapter } from '../../../../../db';
import type { EntityId } from '../../../../../db/types';
import type { TeamMemberDetail } from '../../../../../business/support/user/team/entity';
import type {
  CreateTeam,
  CreateTeamMember,
  TeamMemberQuery,
  UpdateTeam,
  UpdateTeamLimit
} from '../../../../../business/support/user/team/dto';
import type {
  TeamRepository,
  CreateDefaultTeamParams,
  TeamReference,
  TeamScopedReference
} from '../../../../../business/support/user/team/repository';
import type {
  Team,
  TeamMember,
  TeamMemberRelations
} from '../../../../../business/support/user/team/entity';
import type { GroupRepository } from '../../../../../business/support/user/team/group';
import type { OrgRepository } from '../../../../../business/support/user/team/org';
import type { TransactionContext } from '../../../../../db/transaction';
import { MongoErrorAdapter } from '../../../../errors';
import { getTeamModel, type TeamMongooseSchemaType } from './schema';
import {
  getTeamMemberModel,
  type TeamMemberDocument,
  type TeamMemberMongooseSchemaType
} from './member/schema';
import { getMongoSession } from '../../../../transaction';
import { toEntityId, toMongoObjectId } from '../../../../utils';
import { toTeam, toTeamMember, toTeamMemberDetail, toTeamMemberRelations } from './entity';
import type { TeamDocument } from './schema';
import type { UserDocument } from '../schema';
import { createMongoGroupRepository } from './group/repository';
import { createMongoOrgRepository } from './org/repository';

type TeamMemberRelationsDocument = TeamMemberDocument & {
  team?: TeamDocument;
  user?: UserDocument;
};

export class MongoTeamRepository implements TeamRepository {
  constructor(
    private readonly teamModel: Model<TeamMongooseSchemaType> = getTeamModel(mongoose),
    private readonly teamMemberModel: Model<TeamMemberMongooseSchemaType> = getTeamMemberModel(
      mongoose
    ),
    private readonly errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter(),
    private readonly groupRepository: GroupRepository = createMongoGroupRepository(
      mongoose,
      errorAdapter
    ),
    private readonly orgRepository: OrgRepository = createMongoOrgRepository(mongoose, errorAdapter)
  ) {}

  private execute<T>(handler: () => Promise<T>) {
    return this.errorAdapter.execute(handler);
  }

  private withSession<T>(query: Query<T, any>, context?: TransactionContext) {
    const session = getMongoSession(context);
    return session ? query.session(session) : query;
  }

  private getMemberFilter(query?: TeamMemberQuery) {
    return {
      ...(query?.teamId ? { teamId: toMongoObjectId(query.teamId) } : {}),
      ...(query?.includeLeft === false
        ? {
            status: {
              $nin: [TeamMemberStatusEnum.leave, TeamMemberStatusEnum.forbidden]
            }
          }
        : {})
    };
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

  async findMemberByTeamAndUser(
    teamId: EntityId,
    userId: EntityId,
    query?: TeamMemberQuery,
    context?: TransactionContext
  ): Promise<TeamMemberDetail | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.teamMemberModel.findOne({
          ...this.getMemberFilter({ ...query, teamId }),
          userId: toMongoObjectId(userId)
        }),
        context
      ).lean<TeamMemberDocument>();
      return document ? toTeamMemberDetail(document) : null;
    });
  }

  async findMemberByIdInTeam(
    id: EntityId,
    teamId: EntityId,
    query?: TeamMemberQuery,
    context?: TransactionContext
  ): Promise<TeamMemberDetail | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.teamMemberModel.findOne({
          ...this.getMemberFilter({ ...query, teamId }),
          _id: toMongoObjectId(id)
        }),
        context
      ).lean<TeamMemberDocument>();
      return document ? toTeamMemberDetail(document) : null;
    });
  }

  async findMemberRelationsById(
    id: EntityId,
    context?: TransactionContext
  ): Promise<TeamMemberRelations | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.teamMemberModel.findById(toMongoObjectId(id)).populate('team').populate('user'),
        context
      ).lean<TeamMemberRelationsDocument>();
      return document?.team ? toTeamMemberRelations(document) : null;
    });
  }

  async findMemberRelationsByUserId(
    userId: EntityId,
    context?: TransactionContext
  ): Promise<TeamMemberRelations | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.teamMemberModel
          .findOne({ userId: toMongoObjectId(userId) })
          .populate('team')
          .populate('user'),
        context
      ).lean<TeamMemberRelationsDocument>();
      return document?.team ? toTeamMemberRelations(document) : null;
    });
  }

  async findMemberRelationsByTeamId(
    teamId: EntityId,
    context?: TransactionContext
  ): Promise<TeamMemberRelations[]> {
    return this.execute(async () => {
      const documents = await this.withSession(
        this.teamMemberModel
          .find({ teamId: toMongoObjectId(teamId) })
          .populate('team')
          .populate('user'),
        context
      ).lean<TeamMemberRelationsDocument[]>();
      return documents.filter((document) => document.team).map(toTeamMemberRelations);
    });
  }

  async findOwnerByTeamId(
    teamId: EntityId,
    context?: TransactionContext
  ): Promise<TeamMember | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.teamMemberModel.findOne({
          teamId: toMongoObjectId(teamId),
          role: TeamMemberRoleEnum.owner
        }),
        context
      ).lean<TeamMemberDocument>();
      return document ? toTeamMember(document) : null;
    });
  }

  async findMembersByIds(
    ids: EntityId[],
    query?: TeamMemberQuery,
    context?: TransactionContext
  ): Promise<TeamMember[]> {
    if (ids.length === 0) return [];
    return this.execute(async () => {
      const documents = await this.withSession(
        this.teamMemberModel.find({
          ...this.getMemberFilter(query),
          _id: { $in: ids.map(toMongoObjectId) }
        }),
        context
      ).lean<TeamMemberDocument[]>();
      return documents.map(toTeamMember);
    });
  }

  async findMembersByTeamId(
    teamId: EntityId,
    query?: TeamMemberQuery,
    context?: TransactionContext
  ): Promise<TeamMember[]> {
    return this.execute(async () => {
      const documents = await this.withSession(
        this.teamMemberModel.find(this.getMemberFilter({ ...query, teamId })),
        context
      ).lean<TeamMemberDocument[]>();
      return documents.map(toTeamMember);
    });
  }

  async countMembersByTeamId(
    teamId: EntityId,
    query?: TeamMemberQuery,
    context?: TransactionContext
  ): Promise<number> {
    return this.execute(async () =>
      this.withSession(
        this.teamMemberModel.countDocuments(this.getMemberFilter({ ...query, teamId })),
        context
      )
    );
  }

  async findTeamById(teamId: EntityId, context?: TransactionContext): Promise<Team | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.teamModel.findById(toMongoObjectId(teamId)),
        context
      ).lean<TeamDocument>();
      return document ? toTeam(document) : null;
    });
  }

  async findTeamsByIds(teamIds: EntityId[], context?: TransactionContext): Promise<Team[]> {
    if (teamIds.length === 0) return [];
    return this.execute(async () => {
      const documents = await this.withSession(
        this.teamModel.find({ _id: { $in: teamIds.map(toMongoObjectId) } }),
        context
      ).lean<TeamDocument[]>();
      return documents.map(toTeam);
    });
  }

  async findAllTeamIds(context?: TransactionContext): Promise<EntityId[]> {
    return this.execute(async () => {
      const documents = await this.withSession(this.teamModel.find().select('_id'), context).lean<
        { _id: unknown }[]
      >();
      return documents.map((document) => toEntityId(document._id));
    });
  }

  async findTeamReferencesByIds(
    teamIds: EntityId[],
    context?: TransactionContext
  ): Promise<TeamReference[]> {
    if (teamIds.length === 0) return [];
    return this.execute(async () => {
      const documents = await this.withSession(
        this.teamModel.find({ _id: { $in: teamIds.map(toMongoObjectId) } }).select('_id'),
        context
      ).lean<Array<{ _id: unknown }>>();
      return documents.map((document) => ({ id: toEntityId(document._id) }));
    });
  }

  async findMemberReferencesByIds(
    ids: EntityId[],
    context?: TransactionContext
  ): Promise<TeamScopedReference[]> {
    if (ids.length === 0) return [];
    return this.execute(async () => {
      const documents = await this.withSession(
        this.teamMemberModel.find({ _id: { $in: ids.map(toMongoObjectId) } }).select('_id teamId'),
        context
      ).lean<Array<{ _id: unknown; teamId: unknown }>>();
      return documents.map((document) => ({
        id: toEntityId(document._id),
        teamId: toEntityId(document.teamId)
      }));
    });
  }

  async createTeam(input: CreateTeam, context?: TransactionContext): Promise<Team> {
    return this.execute(async () => {
      const session = getMongoSession(context);
      const [document] = await this.teamModel.create([input], session ? { session } : undefined);
      return toTeam(document.toObject() as TeamDocument);
    });
  }

  async createTeamMember(
    input: CreateTeamMember,
    context?: TransactionContext
  ): Promise<TeamMember> {
    return this.execute(async () => {
      const session = getMongoSession(context);
      const [document] = await this.teamMemberModel.create(
        [input],
        session ? { session } : undefined
      );
      return toTeamMember(document.toObject() as TeamMemberDocument);
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

  async updateTeam(
    teamId: EntityId,
    patch: UpdateTeam,
    context?: TransactionContext
  ): Promise<Team | null> {
    return this.execute(async () => {
      const $set: Record<string, unknown> = {};
      const $unset: Record<string, 1> = {};
      if (patch.name !== undefined) $set.name = patch.name;
      if (patch.avatar !== undefined) $set.avatar = patch.avatar;
      if (patch.openaiAccount) $set.openaiAccount = patch.openaiAccount;
      if (patch.clearOpenaiAccount) $unset.openaiAccount = 1;
      if (patch.externalWorkflowVariable) {
        const field = `externalWorkflowVariables.${patch.externalWorkflowVariable.key}`;
        if (patch.externalWorkflowVariable.value === '') {
          $unset[field] = 1;
        } else {
          $set[field] = patch.externalWorkflowVariable.value;
        }
      }

      const document = await this.withSession(
        this.teamModel.findByIdAndUpdate(
          toMongoObjectId(teamId),
          {
            ...($set && Object.keys($set).length > 0 ? { $set } : {}),
            ...($unset && Object.keys($unset).length > 0 ? { $unset } : {})
          },
          { new: true }
        ),
        context
      ).lean<TeamDocument>();
      return document ? toTeam(document) : null;
    });
  }

  async updateTeamLimit(
    teamId: EntityId,
    patch: UpdateTeamLimit,
    context?: TransactionContext
  ): Promise<Team | null> {
    return this.execute(async () => {
      const $set: Record<string, unknown> = {};
      const $unset: Record<string, 1> = {};
      for (const [key, value] of Object.entries(patch)) {
        const field = `limit.${key}`;
        if (value === null) {
          $unset[field] = 1;
        } else if (value !== undefined) {
          $set[field] = value;
        }
      }
      const document = await this.withSession(
        this.teamModel.findByIdAndUpdate(
          toMongoObjectId(teamId),
          {
            ...($set && Object.keys($set).length > 0 ? { $set } : {}),
            ...($unset && Object.keys($unset).length > 0 ? { $unset } : {})
          },
          { new: true }
        ),
        context
      ).lean<TeamDocument>();
      return document ? toTeam(document) : null;
    });
  }

  async deleteMembersByTeamId(teamId: EntityId, context?: TransactionContext): Promise<void> {
    await this.execute(async () => {
      await this.withSession(
        this.teamMemberModel.deleteMany({ teamId: toMongoObjectId(teamId) }),
        context
      );
    });
  }

  async clearTeamSensitiveData(
    teamId: EntityId,
    context?: TransactionContext
  ): Promise<Team | null> {
    return this.execute(async () => {
      const document = await this.withSession(
        this.teamModel.findByIdAndUpdate(
          toMongoObjectId(teamId),
          {
            $set: { notificationAccount: '' },
            $unset: {
              openaiAccount: 1,
              externalWorkflowVariables: 1,
              meta: 1
            }
          },
          { new: true }
        ),
        context
      ).lean<TeamDocument>();
      return document ? toTeam(document) : null;
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
      await this.groupRepository.createMemberGroup(
        {
          teamId: toEntityId(tmbDocument.teamId),
          name: DefaultGroupName,
          avatar
        },
        context
      );
      await this.orgRepository.createOrg(
        {
          teamId: toEntityId(tmbDocument.teamId),
          name: 'ROOT',
          path: ''
        },
        context
      );

      return toTeamMemberDetail(tmbDocument.toObject() as TeamMemberDocument);
    });
  }
}

export const createMongoTeamRepository = (
  client: Mongoose,
  errorAdapter: DatabaseErrorAdapter = new MongoErrorAdapter(),
  repositories: {
    groupRepository?: GroupRepository;
    orgRepository?: OrgRepository;
  } = {}
) =>
  new MongoTeamRepository(
    getTeamModel(client),
    getTeamMemberModel(client),
    errorAdapter,
    repositories.groupRepository ?? createMongoGroupRepository(client, errorAdapter),
    repositories.orgRepository ?? createMongoOrgRepository(client, errorAdapter)
  );
