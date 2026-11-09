import { describe, it, expect } from 'vitest';
import { resolveChatProxyMember } from '@fastgpt/service/core/chat/identity';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getUser } from '@test/datas/users';

describe('resolveChatProxyMember', () => {
  it('keeps API key owner as effective caller when authProxy is omitted', async () => {
    const owner = await getUser('completion-proxy-owner-omitted');

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      })
    ).resolves.toEqual({
      tmbId: owner.tmbId,
      isProxy: false
    });
  });

  it('resolves username to an active team member in the API key team', async () => {
    const owner = await getUser('completion-proxy-owner-username');
    const member = await getUser('completion-proxy-member-username', owner.teamId);

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: true,
        authProxy: {
          username: 'completion-proxy-member-username'
        }
      })
    ).resolves.toEqual({
      tmbId: member.tmbId,
      userId: member.userId,
      isProxy: true
    });
  });

  it('resolves tmbId to an active team member in the API key team', async () => {
    const owner = await getUser('completion-proxy-owner-tmbid');
    const member = await getUser('completion-proxy-member-tmbid', owner.teamId);

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: true,
        authProxy: {
          tmbId: member.tmbId
        }
      })
    ).resolves.toEqual({
      tmbId: member.tmbId,
      userId: member.userId,
      isProxy: true
    });
  });

  it('accepts username and tmbId that point to the same member', async () => {
    const owner = await getUser('completion-proxy-owner-both');
    const member = await getUser('completion-proxy-member-both', owner.teamId);

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: true,
        authProxy: {
          username: 'completion-proxy-member-both',
          tmbId: member.tmbId
        }
      })
    ).resolves.toEqual({
      tmbId: member.tmbId,
      userId: member.userId,
      isProxy: true
    });
  });

  it('prioritizes tmbId when username points to a different member', async () => {
    const owner = await getUser('completion-proxy-owner-mismatch');
    const memberA = await getUser('completion-proxy-member-a-mismatch', owner.teamId);
    const memberB = await getUser('completion-proxy-member-b-mismatch', owner.teamId);

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: true,
        authProxy: {
          username: 'completion-proxy-member-a-mismatch',
          tmbId: memberB.tmbId
        }
      })
    ).resolves.toEqual({
      tmbId: memberB.tmbId,
      userId: memberB.userId,
      isProxy: true
    });

    expect(memberA.tmbId).not.toBe(memberB.tmbId);
  });

  it('ignores a nonexistent username when tmbId resolves to an active member', async () => {
    const owner = await getUser('completion-proxy-owner-missing-username');
    const member = await getUser('completion-proxy-member-missing-username', owner.teamId);

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: true,
        authProxy: {
          username: 'nonexistent-proxy-user',
          tmbId: member.tmbId
        }
      })
    ).resolves.toEqual({
      tmbId: member.tmbId,
      userId: member.userId,
      isProxy: true
    });
  });

  it('does not fall back to username when the selected tmbId does not exist', async () => {
    const username = 'completion-proxy-owner-missing-tmbid';
    const owner = await getUser(username);

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: true,
        authProxy: {
          username,
          tmbId: '68ad85a7463006c963799a05'
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('rejects members outside the API key team', async () => {
    const owner = await getUser('completion-proxy-owner-cross-team');
    const outsider = await getUser('completion-proxy-outsider-cross-team');

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: true,
        authProxy: {
          username: 'completion-proxy-owner-cross-team',
          tmbId: outsider.tmbId
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('rejects leave or forbidden members', async () => {
    const owner = await getUser('completion-proxy-owner-forbidden');
    const forbidden = await getUser('completion-proxy-member-forbidden', owner.teamId);
    await MongoTeamMember.updateOne(
      { _id: forbidden.tmbId },
      { status: TeamMemberStatusEnum.forbidden }
    );

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: true,
        authProxy: {
          username: 'completion-proxy-owner-forbidden',
          tmbId: forbidden.tmbId
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('rejects authProxy when APIKey capability is disabled', async () => {
    const owner = await getUser('completion-proxy-owner-disabled');

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: false,
        authProxy: {
          tmbId: owner.tmbId
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('rejects authProxy for app-level APIKey', async () => {
    const owner = await getUser('completion-proxy-owner-app-key');

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        legacyAppId: '507f1f77bcf86cd799439011',
        apiKeyAuthProxy: true,
        authProxy: {
          tmbId: owner.tmbId
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('rejects authProxy for non API key auth', async () => {
    const owner = await getUser('completion-proxy-owner-token');

    await expect(
      resolveChatProxyMember({
        authType: AuthUserTypeEnum.token,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        authProxy: {
          tmbId: owner.tmbId
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });
});
