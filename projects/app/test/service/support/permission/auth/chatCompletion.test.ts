import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  AuthUserTypeEnum,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { getUser } from '@test/datas/users';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { authChatCompletionHeaderRequest } from '@/service/support/permission/auth/chatCompletion';

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
  legacyAppId,
  parsedAppId,
  apiKeyAuthProxy = true
}: {
  owner: TestUser;
  appId?: string;
  legacyAppId?: string;
  parsedAppId?: string;
  apiKeyAuthProxy?: boolean;
}) => ({
  ...owner,
  appId: appId || '',
  legacyAppId: legacyAppId || '',
  apiKeyType: legacyAppId ? 'app' : 'personal',
  boundAppId: legacyAppId || undefined,
  parsedAppId: parsedAppId || '',
  authType: AuthUserTypeEnum.apikey,
  apikey: 'test-api-key',
  apiKeyAuthProxy
});

const grantAppReadPermission = async ({
  teamId,
  tmbId,
  appId
}: {
  teamId: string;
  tmbId: string;
  appId: unknown;
}) => {
  await MongoResourcePermission.create({
    teamId,
    tmbId,
    resourceType: PerResourceTypeEnum.app,
    resourceId: String(appId),
    permission: ReadPermissionVal
  });
};

describe('authChatCompletionHeaderRequest', () => {
  beforeEach(() => {
    vi.mocked(authCert).mockClear();
  });

  it('returns the proxied tmbId and keeps API key usage attribution data', async () => {
    const owner = await getUser('completion-header-owner-proxy');
    const member = await getUser('completion-header-member-proxy', owner.teamId);
    const app = await createApiApp(owner);
    await grantAppReadPermission({
      teamId: owner.teamId,
      tmbId: member.tmbId,
      appId: app._id
    });

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
    expect(result.canReadModerationRecords).toBe(false);
    expect(result.showSkillReferences).toBe(true);
    expect(vi.mocked(authCert)).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: true,
        authApiKey: true
      })
    );
  });

  it('allows a proxied caller to continue their own chat', async () => {
    const owner = await getUser('completion-header-owner-own-chat');
    const member = await getUser('completion-header-member-own-chat', owner.teamId);
    const app = await createApiApp(owner);
    const chatId = 'own-chat';
    await grantAppReadPermission({
      teamId: owner.teamId,
      tmbId: member.tmbId,
      appId: app._id
    });
    await MongoChat.create({
      appId: app._id,
      chatId,
      teamId: owner.teamId,
      tmbId: member.tmbId,
      sourceType: ChatSourceTypeEnum.app,
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
    await grantAppReadPermission({
      teamId: owner.teamId,
      tmbId: memberB.tmbId,
      appId: app._id
    });
    await MongoChat.create({
      appId: app._id,
      chatId,
      teamId: owner.teamId,
      tmbId: memberA.tmbId,
      sourceType: ChatSourceTypeEnum.app,
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

  it.each(['personal', 'app'])(
    'keeps the first external user binding for %s keys',
    async (type) => {
      const owner = await getUser('completion-fixed-uid-' + type);
      const app = await createApiApp(owner);
      const chatId = 'fixed-uid';
      await MongoChat.create({
        appId: app._id,
        chatId,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        sourceType: ChatSourceTypeEnum.app,
        source: ChatSourceEnum.api,
        outLinkUid: 'u1'
      });
      const params = {
        req: {
          auth: createApiKeyAuth({
            owner,
            ...(type === 'app' ? { legacyAppId: String(app._id) } : {})
          })
        } as any,
        appId: String(app._id),
        chatId
      };
      for (const customUid of [undefined, '', 'u2']) {
        await expect(authChatCompletionHeaderRequest({ ...params, customUid })).rejects.toBe(
          ChatErrEnum.unAuthChat
        );
      }
      await expect(
        authChatCompletionHeaderRequest({ ...params, customUid: 'u1' })
      ).resolves.toMatchObject({ tmbId: owner.tmbId });
    }
  );

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
            legacyAppId: String(app._id)
          })
        } as any,
        authProxy: {
          tmbId: member.tmbId
        }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('uses the app API key binding before a different body appId', async () => {
    const owner = await getUser('completion-header-owner-app-key-same-team');
    const boundApp = await createApiApp(owner);
    const requestApp = await createApiApp(owner);

    const result = await authChatCompletionHeaderRequest({
      req: {
        auth: createApiKeyAuth({
          owner,
          appId: String(boundApp._id),
          legacyAppId: String(boundApp._id)
        })
      } as any,
      appId: String(requestApp._id)
    });

    expect(String(result.app._id)).toBe(String(boundApp._id));
    expect(result.teamId).toBe(owner.teamId);
    expect(result.tmbId).toBe(owner.tmbId);
  });

  it('ignores a foreign body appId and executes the app API key binding', async () => {
    const owner = await getUser('completion-header-owner-app-key-cross-team');
    const outsider = await getUser('completion-header-outsider-app-key-cross-team');
    const boundApp = await createApiApp(owner);
    const outsiderApp = await createApiApp(outsider);

    const result = await authChatCompletionHeaderRequest({
      req: {
        auth: createApiKeyAuth({
          owner,
          appId: String(boundApp._id),
          legacyAppId: String(boundApp._id)
        })
      } as any,
      appId: String(outsiderApp._id)
    });
    expect(String(result.app._id)).toBe(String(boundApp._id));
  });

  it('rejects authProxy when the proxied member lacks target app permission', async () => {
    const owner = await getUser('completion-header-owner-proxy-app-per');
    const member = await getUser('completion-header-member-proxy-app-per', owner.teamId);
    const app = await createApiApp(owner);

    await expect(
      authChatCompletionHeaderRequest({
        req: {
          auth: createApiKeyAuth({
            owner
          })
        } as any,
        appId: String(app._id),
        authProxy: {
          username: 'completion-header-owner-proxy-app-per',
          tmbId: member.tmbId
        }
      })
    ).rejects.toBe(AppErrEnum.unAuthApp);
  });

  it('allows authProxy when the proxied member has target app permission', async () => {
    const owner = await getUser('completion-header-owner-proxy-own-app-per');
    const member = await getUser('completion-header-member-proxy-own-app-per', owner.teamId);
    const app = await createApiApp(owner);
    await grantAppReadPermission({
      teamId: owner.teamId,
      tmbId: member.tmbId,
      appId: app._id
    });

    const result = await authChatCompletionHeaderRequest({
      req: {
        auth: createApiKeyAuth({
          owner
        })
      } as any,
      appId: String(app._id),
      authProxy: {
        tmbId: member.tmbId
      }
    });

    expect(result.tmbId).toBe(member.tmbId);
  });
});
