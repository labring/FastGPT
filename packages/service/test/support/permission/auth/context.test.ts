import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildAuthContextPipeline,
  resolveAuthContext
} from '@fastgpt/service/support/permission/auth/context';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { Types } from 'mongoose';

describe('auth context', () => {
  beforeEach(async () => {
    await Promise.all([MongoTeam.deleteMany({}), MongoTeamMember.deleteMany({})]);
  });

  it('resolves the actual user and current team owner from one aggregation', async () => {
    const userId = new Types.ObjectId();
    const ownerId = new Types.ObjectId();
    const [team] = await MongoTeam.create([{ name: 'Auth context team', ownerId }]);
    const [member] = await MongoTeamMember.create([
      {
        teamId: team._id,
        userId,
        name: 'Member',
        status: 'active'
      }
    ]);

    await expect(
      resolveAuthContext({
        userId: String(userId),
        teamId: String(team._id),
        tmbId: String(member._id)
      })
    ).resolves.toEqual({
      userId: String(userId),
      teamId: String(team._id),
      tmbId: String(member._id),
      ownerId: String(ownerId)
    });
  });

  it('provides an explainable aggregation for benchmark checks', async () => {
    const userId = new Types.ObjectId();
    const [team] = await MongoTeam.create([{ name: 'Explain team', ownerId: userId }]);
    const [member] = await MongoTeamMember.create([
      {
        teamId: team._id,
        userId,
        name: 'Owner',
        status: 'active'
      }
    ]);
    const pipeline = buildAuthContextPipeline({
      userId: String(userId),
      teamId: String(team._id),
      tmbId: String(member._id)
    });

    expect(pipeline).not.toBeNull();
    const explain = await MongoTeamMember.aggregate(pipeline!).explain();
    expect(explain).toBeDefined();
  });
});
