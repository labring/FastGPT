import { beforeEach, describe, expect, it } from 'vitest';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';
import { MongoAccountCancellation } from '@fastgpt/service/support/user/account/cancellation/schema';
import { AccountCancellationStatusEnum } from '@fastgpt/global/support/user/account/cancellation/constants';
import { loginLocalAccount } from '@/service/support/user/login/service';

describe('loginLocalAccount', () => {
  let identity: {
    kind: 'local';
    userId: string;
    username: string;
    lastLoginTmbId: string;
    isRoot: boolean;
  };

  beforeEach(async () => {
    const user = await MongoUser.create({
      username: 'user',
      password: 'password',
      status: UserStatusEnum.active
    });
    const team = await MongoTeam.create({ name: 'Team', ownerId: user._id });
    await initTeamFreePlan({ teamId: String(team._id) });
    const tmb = await MongoTeamMember.create({
      teamId: team._id,
      userId: user._id,
      status: 'active',
      role: 'owner'
    });
    identity = {
      kind: 'local',
      userId: String(user._id),
      username: user.username,
      lastLoginTmbId: String(tmb._id),
      isRoot: false
    };
  });

  it('loads the user, updates login preferences and creates a session', async () => {
    const result = await loginLocalAccount({ identity, language: 'en', ip: '127.0.0.1' });

    expect(result.user.team.tmbId).toBe(identity.lastLoginTmbId);
    expect(result.token).toEqual(expect.any(String));
    await expect(MongoUser.findById(identity.userId).lean()).resolves.toMatchObject({
      language: 'en',
      lastLoginTmbId: identity.lastLoginTmbId
    });
  });

  it('creates a recovery session for a cancelling account without a last login team', async () => {
    await MongoAccountCancellation.create({
      userId: identity.userId,
      status: AccountCancellationStatusEnum.pending,
      requestedAt: new Date()
    });

    const result = await loginLocalAccount({
      identity: { ...identity, lastLoginTmbId: undefined }
    });

    expect(result.user.team.tmbId).toBe(identity.lastLoginTmbId);
    expect(result.user.team.accountCancellation).toBeDefined();
    expect(result.token).toEqual(expect.any(String));
  });

  it('prefers an active team before using a cancelling team as login fallback', async () => {
    const otherOwner = await MongoUser.create({
      username: 'other-owner',
      password: 'password',
      status: UserStatusEnum.active
    });
    const activeTeam = await MongoTeam.create({ name: 'Active Team', ownerId: otherOwner._id });
    const activeTmb = await MongoTeamMember.create({
      teamId: activeTeam._id,
      userId: identity.userId,
      status: 'active',
      role: 'member',
      createTime: new Date(Date.now() + 1000)
    });
    await MongoAccountCancellation.create({
      userId: identity.userId,
      status: AccountCancellationStatusEnum.pending,
      requestedAt: new Date()
    });

    const result = await loginLocalAccount({
      identity: { ...identity, lastLoginTmbId: undefined }
    });

    expect(result.user.team.tmbId).toBe(String(activeTmb._id));
  });

  it('keeps the Wecom password-login restriction in the application layer', async () => {
    await expect(
      loginLocalAccount({
        identity: { ...identity, username: 'wecom-user' }
      })
    ).rejects.toThrow('Wecom user can not login with password');
  });

  it('persists an incoming visitor id when the user has no stored attribution', async () => {
    await loginLocalAccount({
      identity,
      fastgpt_sem: { visitor_id: 'visitor-1' }
    });

    await expect(MongoUser.findById(identity.userId).lean()).resolves.toMatchObject({
      fastgpt_sem: { visitor_id: 'visitor-1' }
    });
  });

  it('keeps the stored visitor id when login carries a different one', async () => {
    await MongoUser.updateOne(
      { _id: identity.userId },
      { fastgpt_sem: { visitor_id: 'stored-visitor' } }
    );

    await loginLocalAccount({
      identity,
      fastgpt_sem: { visitor_id: 'incoming-visitor' }
    });

    await expect(MongoUser.findById(identity.userId).lean()).resolves.toMatchObject({
      fastgpt_sem: { visitor_id: 'stored-visitor' }
    });
  });
});
