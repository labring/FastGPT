import { describe, expect, it } from 'vitest';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getUser } from '@test/datas/users';
import {
  authChatCompletionHeaderRequest,
  resolveChatCompletionEffectiveTmbId
} from '@/service/support/permission/auth/chatCompletion';

type TestUser = Awaited<ReturnType<typeof getUser>>;

const createApiApp = (owner: TestUser) => {
  return MongoApp.create({
    name: `app-${owner.tmbId}`,
    type: AppTypeEnum.simple,
    teamId: owner.teamId,
    tmbId: owner.tmbId
  });
};

const createApiKeyAuth = ({
  owner,
  appId,
  apiKeyAppId,
  apiKeyAuthProxy = true
}: {
  owner: TestUser;
  appId?: string;
  apiKeyAppId?: string;
  apiKeyAuthProxy?: boolean;
}) => ({
  ...owner,
  appId: appId || '',
  apiKeyAppId: apiKeyAppId || '',
  authType: AuthUserTypeEnum.apikey,
  apikey: 'test-api-key',
  apiKeyAuthProxy
});

describe('resolveChatCompletionEffectiveTmbId', () => {
  it('keeps API key owner as effective caller when authProxy is omitted', async () => {
    const owner = await getUser('completion-proxy-owner-omitted');

    await expect(
      resolveChatCompletionEffectiveTmbId({
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
      resolveChatCompletionEffectiveTmbId({
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
      isProxy: true
    });
  });

  it('resolves tmbId to an active team member in the API key team', async () => {
    const owner = await getUser('completion-proxy-owner-tmbid');
    const member = await getUser('completion-proxy-member-tmbid', owner.teamId);

    await expect(
      resolveChatCompletionEffectiveTmbId({
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
      isProxy: true
    });
  });

  it('accepts username and tmbId only when they point to the same member', async () => {
    const owner = await getUser('completion-proxy-owner-both');
    const member = await getUser('completion-proxy-member-both', owner.teamId);

    await expect(
      resolveChatCompletionEffectiveTmbId({
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
      isProxy: true
    });
  });

  it('rejects username and tmbId that point to different members', async () => {
    const owner = await getUser('completion-proxy-owner-mismatch');
    const memberA = await getUser('completion-proxy-member-a-mismatch', owner.teamId);
    const memberB = await getUser('completion-proxy-member-b-mismatch', owner.teamId);

    await expect(
      resolveChatCompletionEffectiveTmbId({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: true,
        authProxy: {
          username: 'completion-proxy-member-a-mismatch',
          tmbId: memberB.tmbId
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);

    expect(memberA.tmbId).not.toBe(memberB.tmbId);
  });

  it('rejects members outside the API key team', async () => {
    const owner = await getUser('completion-proxy-owner-cross-team');
    const outsider = await getUser('completion-proxy-outsider-cross-team');

    await expect(
      resolveChatCompletionEffectiveTmbId({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: true,
        authProxy: {
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
      resolveChatCompletionEffectiveTmbId({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAuthProxy: true,
        authProxy: {
          tmbId: forbidden.tmbId
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('rejects authProxy when APIKey capability is disabled', async () => {
    const owner = await getUser('completion-proxy-owner-disabled');

    await expect(
      resolveChatCompletionEffectiveTmbId({
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
      resolveChatCompletionEffectiveTmbId({
        authType: AuthUserTypeEnum.apikey,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        apiKeyAppId: 'app-key-bound-app',
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
      resolveChatCompletionEffectiveTmbId({
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

describe('authChatCompletionHeaderRequest', () => {
  it('returns the proxied tmbId and keeps API key usage attribution data', async () => {
    const owner = await getUser('completion-header-owner-proxy');
    const member = await getUser('completion-header-member-proxy', owner.teamId);
    const app = await createApiApp(owner);

    const result = await authChatCompletionHeaderRequest({
      req: {
        auth: createApiKeyAuth({
          owner
        })
      } as any,
      appId: String(app._id),
      authProxy: {
        username: 'completion-header-member-proxy'
      },
      showSkillReferences: true
    });

    expect(result.tmbId).toBe(member.tmbId);
    expect(result.teamId).toBe(owner.teamId);
    expect(result.apikey).toBe('test-api-key');
    expect(result.showSkillReferences).toBe(true);
  });

  it('allows a proxied caller to continue their own chat', async () => {
    const owner = await getUser('completion-header-owner-own-chat');
    const member = await getUser('completion-header-member-own-chat', owner.teamId);
    const app = await createApiApp(owner);
    const chatId = 'own-chat';
    await MongoChat.create({
      appId: app._id,
      chatId,
      teamId: owner.teamId,
      tmbId: member.tmbId,
      source: ChatSourceEnum.api
    });

    const result = await authChatCompletionHeaderRequest({
      req: {
        auth: createApiKeyAuth({
          owner
        })
      } as any,
      appId: String(app._id),
      chatId,
      authProxy: {
        tmbId: member.tmbId
      }
    });

    expect(result.tmbId).toBe(member.tmbId);
  });

  it('rejects a proxied caller continuing another member chat', async () => {
    const owner = await getUser('completion-header-owner-other-chat');
    const memberA = await getUser('completion-header-member-a-other-chat', owner.teamId);
    const memberB = await getUser('completion-header-member-b-other-chat', owner.teamId);
    const app = await createApiApp(owner);
    const chatId = 'other-chat';
    await MongoChat.create({
      appId: app._id,
      chatId,
      teamId: owner.teamId,
      tmbId: memberA.tmbId,
      source: ChatSourceEnum.api
    });

    await expect(
      authChatCompletionHeaderRequest({
        req: {
          auth: createApiKeyAuth({
            owner
          })
        } as any,
        appId: String(app._id),
        chatId,
        authProxy: {
          tmbId: memberB.tmbId
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('rejects authProxy when the APIKey is bound to an app', async () => {
    const owner = await getUser('completion-header-owner-app-key');
    const member = await getUser('completion-header-member-app-key', owner.teamId);
    const app = await createApiApp(owner);

    await expect(
      authChatCompletionHeaderRequest({
        req: {
          auth: createApiKeyAuth({
            owner,
            appId: String(app._id),
            apiKeyAppId: String(app._id)
          })
        } as any,
        authProxy: {
          tmbId: member.tmbId
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('allows legacy Bearer key-appId when the global APIKey enables authProxy', async () => {
    const owner = await getUser('completion-header-owner-legacy');
    const member = await getUser('completion-header-member-legacy', owner.teamId);
    const app = await createApiApp(owner);

    const result = await authChatCompletionHeaderRequest({
      req: {
        auth: createApiKeyAuth({
          owner,
          appId: String(app._id)
        })
      } as any,
      authProxy: {
        tmbId: member.tmbId
      }
    });

    expect(result.tmbId).toBe(member.tmbId);
  });
});
