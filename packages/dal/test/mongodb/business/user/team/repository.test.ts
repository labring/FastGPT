import { Types, type Model, type Mongoose } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseInvalidArgumentError } from '../../../../../db';
import type { TeamMemberDetail } from '../../../../../business/support/user/team/entity';
import type { MemberGroupMongooseSchemaType } from '../../../../../mongodb/business/support/user/team/group/schema';
import type { OrgMemberMongooseSchemaType } from '../../../../../mongodb/business/support/user/team/org/member/schema';
import { MongoOrgRepository } from '../../../../../mongodb/business/support/user/team/org/repository';
import type { OrgMongooseSchemaType } from '../../../../../mongodb/business/support/user/team/org/schema';
import type { TeamMongooseSchemaType } from '../../../../../mongodb/business/support/user/team/schema';
import type {
  TeamMemberDocument,
  TeamMemberMongooseSchemaType
} from '../../../../../mongodb/business/support/user/team/member/schema';
import { MongoTeamRepository } from '../../../../../mongodb/business/support/user/team/repository';
import { MongoGroupRepository } from '../../../../../mongodb/business/support/user/team/group/repository';
import type { GroupMemberMongooseSchemaType } from '../../../../../mongodb/business/support/user/team/group/member/schema';

const tmbId = '507f1f77bcf86cd799439011';
const teamId = '507f1f77bcf86cd799439012';
const userId = '507f1f77bcf86cd799439013';

const tmbDocument: TeamMemberDocument = {
  _id: new Types.ObjectId(tmbId),
  __v: 0,
  teamId: new Types.ObjectId(teamId),
  userId: new Types.ObjectId(userId),
  avatar: 'avatar.png',
  name: 'Owner',
  role: 'owner',
  status: 'active',
  createTime: new Date('2026-01-01T00:00:00.000Z')
};

const createQuery = <T>(value: T) => ({
  session: vi.fn().mockReturnThis(),
  lean: vi.fn(async () => value)
});

const createRepository = () => {
  const queries = {
    findById: createQuery<TeamMemberDocument | null>(tmbDocument),
    updateAvatar: createQuery<TeamMemberDocument | null>(tmbDocument),
    existingTmb: createQuery<TeamMemberDocument | null>(null)
  };
  const teamCreate = vi.fn(async () => [{ _id: new Types.ObjectId(teamId) }]);
  const tmbCreate = vi.fn(async () => [{ ...tmbDocument, toObject: vi.fn(() => tmbDocument) }]);
  const groupCreate = vi.fn(async () => [
    {
      toObject: () => ({
        _id: new Types.ObjectId(),
        teamId: new Types.ObjectId(teamId),
        name: 'DEFAULT_GROUP'
      })
    }
  ]);
  const orgCreate = vi.fn(async () => [
    {
      toObject: () => ({
        _id: new Types.ObjectId(),
        teamId: new Types.ObjectId(teamId),
        pathId: 'root',
        path: '',
        name: 'ROOT'
      })
    }
  ]);
  const teamMemberModel = {
    findById: vi.fn(() => queries.findById),
    findByIdAndUpdate: vi.fn(() => queries.updateAvatar),
    findOne: vi.fn(() => queries.existingTmb),
    create: tmbCreate
  } as unknown as Model<TeamMemberMongooseSchemaType>;
  const model = {
    teamModel: {
      create: teamCreate
    } as unknown as Model<TeamMongooseSchemaType>,
    teamMemberModel,
    memberGroupModel: {
      create: groupCreate
    } as unknown as Model<MemberGroupMongooseSchemaType>,
    orgModel: {
      create: orgCreate
    } as unknown as Model<OrgMongooseSchemaType>
  };

  const groupRepository = new MongoGroupRepository(
    model.memberGroupModel,
    {} as Model<GroupMemberMongooseSchemaType>
  );
  const orgRepository = new MongoOrgRepository(
    model.orgModel,
    {} as Model<OrgMemberMongooseSchemaType>
  );

  const repository = new MongoTeamRepository(
    model.teamModel,
    model.teamMemberModel,
    undefined,
    groupRepository,
    orgRepository
  );

  return { repository, model, queries, teamCreate, tmbCreate, groupCreate, orgCreate };
};

describe('MongoTeamRepository.findMemberById', () => {
  it('queries by ObjectId and maps the member detail', async () => {
    const { repository, model } = createRepository();

    const tmb = await repository.findMemberById(tmbId);

    expect(model.teamMemberModel.findById).toHaveBeenCalledWith(new Types.ObjectId(tmbId));
    expect(tmb).toMatchObject({
      id: tmbId,
      teamId,
      userId,
      avatar: 'avatar.png',
      name: 'Owner',
      role: 'owner',
      status: 'active'
    });
  });

  it('returns null when the member does not exist', async () => {
    const { repository, queries } = createRepository();
    queries.findById.lean.mockResolvedValueOnce(null);

    await expect(repository.findMemberById(tmbId)).resolves.toBeNull();
  });

  it('rejects ids that cannot be represented by MongoDB', async () => {
    const { repository, model } = createRepository();

    const error = await repository.findMemberById('sql-id').catch((error) => error);

    expect(error).toBeInstanceOf(DatabaseInvalidArgumentError);
    expect(error).toMatchObject({ code: 'DB_INVALID_ARGUMENT' });
    expect(model.teamMemberModel.findById).not.toHaveBeenCalled();
  });
});

describe('MongoTeamRepository.updateMemberAvatar', () => {
  it('updates the avatar and returns the updated member', async () => {
    const { repository, model } = createRepository();

    const tmb = await repository.updateMemberAvatar(tmbId, 'new-avatar.png');

    expect(model.teamMemberModel.findByIdAndUpdate).toHaveBeenCalledWith(
      new Types.ObjectId(tmbId),
      { $set: { avatar: 'new-avatar.png' } },
      { new: true }
    );
    expect(tmb?.avatar).toBe('avatar.png');
  });

  it('returns null when the member does not exist', async () => {
    const { repository, queries } = createRepository();
    queries.updateAvatar.lean.mockResolvedValueOnce(null);

    await expect(repository.updateMemberAvatar(tmbId, 'new-avatar.png')).resolves.toBeNull();
  });
});

describe('MongoTeamRepository.createDefaultTeam', () => {
  it('creates team, member, default group and root org in order', async () => {
    const { repository, teamCreate, tmbCreate, groupCreate, orgCreate } = createRepository();

    const tmb = await repository.createDefaultTeam({ userId });

    expect(teamCreate).toHaveBeenCalledWith(
      [
        {
          ownerId: userId,
          name: 'My Team',
          avatar: '/icon/logo.svg',
          createTime: expect.any(Date)
        }
      ],
      undefined
    );
    expect(tmbCreate).toHaveBeenCalledWith(
      [
        {
          teamId: new Types.ObjectId(teamId),
          userId,
          name: 'Owner',
          role: 'owner',
          status: 'active',
          createTime: expect.any(Date)
        }
      ],
      undefined
    );
    expect(groupCreate).toHaveBeenCalledWith(
      [
        {
          teamId,
          name: 'DEFAULT_GROUP',
          avatar: '/icon/logo.svg'
        }
      ],
      undefined
    );
    expect(orgCreate).toHaveBeenCalledWith(
      [
        {
          teamId,
          name: 'ROOT',
          path: ''
        }
      ],
      undefined
    );
    expect(tmb?.id).toBe(tmbId);
  });

  it('skips creation when a default member already exists', async () => {
    const { repository, queries, teamCreate, tmbCreate } = createRepository();
    queries.existingTmb.lean.mockResolvedValueOnce(tmbDocument);

    await expect(repository.createDefaultTeam({ userId })).resolves.toBeNull();

    expect(teamCreate).not.toHaveBeenCalled();
    expect(tmbCreate).not.toHaveBeenCalled();
  });
});
