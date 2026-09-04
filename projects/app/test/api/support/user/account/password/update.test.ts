import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';
import type { UpdatePasswordBody } from '@fastgpt/global/openapi/support/user/account/password/api';
import { createPasswordChangeSession } from '@fastgpt/service/support/user/account/password/service';
import { MongoTmpData } from '@fastgpt/service/support/tmpData/schema';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';
import updatePasswordApi from '@/pages/api/support/user/account/password/update';
import { Call } from '@test/utils/request';

describe('password/update API', () => {
  let testUser: any;
  let testTeam: any;
  let testTmb: any;

  beforeEach(async () => {
    testUser = await MongoUser.create({
      username: 'password-update-user',
      password: hashStr('old-password')
    });
    testTeam = await MongoTeam.create({
      name: 'Password Update Team',
      ownerId: testUser._id
    });
    await initTeamFreePlan({ teamId: String(testTeam._id) });
    testTmb = await MongoTeamMember.create({
      teamId: testTeam._id,
      userId: testUser._id,
      status: 'active',
      role: 'owner'
    });
    vi.clearAllMocks();
  });

  const getAuth = (userId = String(testUser._id), isRoot = false) =>
    ({
      userId,
      teamId: String(testTeam._id),
      tmbId: String(testTmb._id),
      isRoot,
      sessionId: 'current-session'
    }) as any;

  const getBody = async ({
    userId = String(testUser._id),
    newPsw = hashStr('new-password')
  } = {}): Promise<UpdatePasswordBody> => ({
    newPsw,
    passwordChangeSession: (
      await createPasswordChangeSession({ userId, loginSessionId: 'current-session' })
    ).sessionId
  });

  it('updates an existing password and its update time', async () => {
    const body = await getBody();
    const response = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      {
        body,
        auth: getAuth()
      }
    );

    expect(response.code).toBe(200);
    expect(await MongoUser.exists({ _id: testUser._id, password: body.newPsw })).toBeTruthy();
    const updatedUser = await MongoUser.findById(testUser._id).lean();
    expect(updatedUser?.passwordUpdateTime).toBeInstanceOf(Date);
  });

  it('consumes the session after a successful password update', async () => {
    const body = await getBody();
    const response = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      { body, auth: getAuth() }
    );

    expect(response.code).toBe(200);
    const reuseResponse = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      { body, auth: getAuth() }
    );
    expect(reuseResponse.code).toBe(500);
  });
  it('rejects a session issued for a different login Session', async () => {
    const body = await getBody();
    const response = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      {
        body,
        auth: { ...getAuth(), sessionId: 'another-session' }
      }
    );

    expect(response.code).toBe(500);
    expect(
      await MongoUser.exists({ _id: testUser._id, password: hashStr('old-password') })
    ).toBeTruthy();
  });

  it('rejects an expired password change session', async () => {
    const body = await getBody();
    await MongoTmpData.updateOne(
      { data: { userId: String(testUser._id), loginSessionId: 'current-session' } },
      { $set: { expireAt: new Date(Date.now() - 1) } }
    );

    const response = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      { body, auth: getAuth() }
    );

    expect(response.code).toBe(500);
    expect(
      await MongoUser.exists({ _id: testUser._id, password: hashStr('old-password') })
    ).toBeTruthy();
  });

  it('keeps the session available when the password update is rejected', async () => {
    const body = await getBody({ newPsw: hashStr('old-password') });
    const rejectedResponse = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      { body, auth: getAuth() }
    );

    expect(rejectedResponse.code).toBe(500);
    expect(rejectedResponse.error).toMatchObject({
      name: 'UserError',
      message: UserErrEnum.newPasswordSameAsOld
    });

    const retryResponse = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      {
        body: { ...body, newPsw: hashStr('retried-password') },
        auth: getAuth()
      }
    );

    expect(retryResponse.code).toBe(200);
    expect(
      await MongoUser.exists({ _id: testUser._id, password: hashStr('retried-password') })
    ).toBeTruthy();
  });

  it('sets the first password for an account without a stored password', async () => {
    const userWithoutPassword = await MongoUser.create({ username: 'password-first-set-user' });
    const body = await getBody({ userId: String(userWithoutPassword._id) });

    const response = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      {
        body,
        auth: getAuth(String(userWithoutPassword._id))
      }
    );

    expect(response.code).toBe(200);
    expect(
      await MongoUser.exists({ _id: userWithoutPassword._id, password: body.newPsw })
    ).toBeTruthy();
    const updatedUser = await MongoUser.findById(userWithoutPassword._id).lean();
    expect(updatedUser?.passwordUpdateTime).toBeInstanceOf(Date);
  });

  it('rejects the current password when a stored password exists', async () => {
    const response = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      {
        body: await getBody({ newPsw: hashStr('old-password') }),
        auth: getAuth()
      }
    );

    expect(response.code).toBe(500);
    expect(response.error).toMatchObject({
      name: 'UserError',
      message: UserErrEnum.newPasswordSameAsOld
    });
    const unchangedUser = await MongoUser.findById(testUser._id).lean();
    expect(unchangedUser?.passwordUpdateTime).toBeUndefined();
  });

  it('rejects a token issued for another user', async () => {
    const response = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      {
        body: await getBody({ userId: 'another-user' }),
        auth: getAuth()
      }
    );

    expect(response.code).toBe(500);
    expect(
      await MongoUser.exists({ _id: testUser._id, password: hashStr('old-password') })
    ).toBeTruthy();
  });

  it('rejects a missing token and non-string password input', async () => {
    const missingTokenResponse = await Call<any, Record<string, never>, undefined>(
      updatePasswordApi,
      {
        body: { newPsw: hashStr('new-password') },
        auth: getAuth()
      }
    );
    const invalidPasswordResponse = await Call<any, Record<string, never>, undefined>(
      updatePasswordApi,
      {
        body: {
          newPsw: { $ne: '' },
          passwordChangeSession: (
            await createPasswordChangeSession({
              userId: String(testUser._id),
              loginSessionId: 'current-session'
            })
          ).sessionId
        },
        auth: getAuth()
      }
    );

    expect(missingTokenResponse.code).toBe(500);
    expect(invalidPasswordResponse.code).toBe(500);
  });

  it('rejects root even with a valid password change session', async () => {
    const body = await getBody();
    const response = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      {
        body,
        auth: getAuth(String(testUser._id), true)
      }
    );

    expect(response.code).toBe(500);
    expect(
      await MongoUser.exists({ _id: testUser._id, password: hashStr('old-password') })
    ).toBeTruthy();
  });

  it('rejects requests without a current Session', async () => {
    const response = await Call<UpdatePasswordBody, Record<string, never>, undefined>(
      updatePasswordApi,
      {
        body: await getBody()
      }
    );

    expect(response.code).toBe(500);
  });
});
