import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type NextApiRequest, type NextApiResponse } from 'next';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { UserError } from '@fastgpt/global/common/error/utils';

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/team', () => ({
  authTeamSpaceToken: vi.fn(),
  getUserChatInfoAndAuthTeamPoints: vi.fn(),
  getRunningUserInfoByTmbId: vi.fn()
}));

vi.mock('@/service/support/permission/auth/outLink', () => ({
  authOutLinkChatStart: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/controller', () => ({
  getChatItems: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn()
  },
  AppCollectionName: 'app'
}));

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: vi.fn()
  }
}));

describe('Chat Completions API', () => {
  let mockReq: Partial<NextApiRequest>;
  let mockRes: Partial<NextApiResponse>;

  beforeEach(() => {
    mockReq = {
      body: {
        messages: [],
        stream: false,
        detail: false
      },
      headers: {}
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      end: vi.fn()
    };

    vi.clearAllMocks();
  });

  describe('authShareChat', () => {
    it('should throw error if app not found', async () => {
      const { authOutLinkChatStart } = await import('@/service/support/permission/auth/outLink');
      vi.mocked(authOutLinkChatStart).mockResolvedValue({
        teamId: 'teamId',
        tmbId: 'tmbId',
        timezone: 'UTC',
        externalProvider: {},
        appId: 'appId',
        authType: AuthUserTypeEnum.outLink,
        responseDetail: false,
        showNodeStatus: false,
        uid: 'uid',
        sourceName: 'test'
      } as any);

      vi.mocked(MongoApp.findById).mockImplementation(
        () =>
          ({
            lean: () => null
          }) as any
      );

      const { authShareChat } = await import('@/pages/api/v2/chat/completions');

      await expect(
        authShareChat({
          shareId: 'shareId',
          outLinkUid: 'uid',
          ip: '127.0.0.1',
          question: 'test'
        })
      ).rejects.toBe('app is empty');
    });

    it('should throw error if chat unauthorized', async () => {
      const { authOutLinkChatStart } = await import('@/service/support/permission/auth/outLink');
      vi.mocked(authOutLinkChatStart).mockResolvedValue({
        teamId: 'teamId',
        tmbId: 'tmbId',
        timezone: 'UTC',
        externalProvider: {},
        appId: 'appId',
        authType: AuthUserTypeEnum.outLink,
        responseDetail: false,
        showNodeStatus: false,
        uid: 'uid',
        sourceName: 'test'
      } as any);

      vi.mocked(MongoApp.findById).mockImplementation(
        () =>
          ({
            lean: () => ({
              _id: 'appId'
            })
          }) as any
      );

      vi.mocked(MongoChat.findOne).mockImplementation(
        () =>
          ({
            lean: () => ({
              shareId: 'differentShareId',
              outLinkUid: 'differentUid'
            })
          }) as any
      );

      const { authShareChat } = await import('@/pages/api/v2/chat/completions');

      await expect(
        authShareChat({
          shareId: 'shareId',
          outLinkUid: 'uid',
          chatId: 'chatId',
          ip: '127.0.0.1',
          question: 'test'
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });
  });

  describe('authTeamSpaceChat', () => {
    it('should throw error if app not found', async () => {
      const { authTeamSpaceToken } = await import('@fastgpt/service/support/permission/auth/team');
      vi.mocked(authTeamSpaceToken).mockRejectedValue(new UserError('The request was denied...'));

      const { authTeamSpaceChat } = await import('@/pages/api/v2/chat/completions');

      await expect(
        authTeamSpaceChat({
          appId: 'appId',
          teamId: 'teamId',
          teamToken: 'token',
          chatId: 'chatId'
        })
      ).rejects.toEqual(new UserError('The request was denied...'));
    });

    it('should throw error if chat unauthorized', async () => {
      const { authTeamSpaceToken } = await import('@fastgpt/service/support/permission/auth/team');
      vi.mocked(authTeamSpaceToken).mockRejectedValue(new UserError('The request was denied...'));

      const { getUserChatInfoAndAuthTeamPoints } = await import(
        '@fastgpt/service/support/permission/auth/team'
      );
      vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
        timezone: 'UTC',
        externalProvider: {}
      } as any);

      const { authTeamSpaceChat } = await import('@/pages/api/v2/chat/completions');

      await expect(
        authTeamSpaceChat({
          appId: 'appId',
          teamId: 'teamId',
          teamToken: 'token',
          chatId: 'chatId'
        })
      ).rejects.toEqual(new UserError('The request was denied...'));
    });
  });

  describe('authHeaderRequest', () => {
    it('should throw error if apiKey app not found', async () => {
      const { authCert } = await import('@fastgpt/service/support/permission/auth/common');
      vi.mocked(authCert).mockResolvedValue({
        appId: 'appId',
        teamId: 'teamId',
        tmbId: 'tmbId',
        authType: AuthUserTypeEnum.apikey,
        sourceName: 'test',
        apikey: 'test-key'
      });

      vi.mocked(MongoApp.findById).mockResolvedValue(null);

      const { authHeaderRequest } = await import('@/pages/api/v2/chat/completions');

      await expect(
        authHeaderRequest({
          req: mockReq as NextApiRequest,
          appId: 'appId'
        })
      ).rejects.toBe('app is empty');
    });

    it('should throw error if chat unauthorized', async () => {
      const { authCert } = await import('@fastgpt/service/support/permission/auth/common');
      vi.mocked(authCert).mockResolvedValue({
        appId: 'appId',
        teamId: 'teamId',
        tmbId: 'tmbId',
        authType: AuthUserTypeEnum.apikey,
        sourceName: 'test',
        apikey: 'test-key'
      });

      const { getUserChatInfoAndAuthTeamPoints } = await import(
        '@fastgpt/service/support/permission/auth/team'
      );
      vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
        timezone: 'UTC',
        externalProvider: {}
      } as any);

      vi.mocked(MongoApp.findById).mockImplementation(
        () =>
          ({
            lean: () => ({
              _id: 'appId'
            })
          }) as any
      );

      vi.mocked(MongoChat.findOne).mockImplementation(
        () =>
          ({
            lean: () => ({
              teamId: 'differentTeamId',
              tmbId: 'differentTmbId'
            })
          }) as any
      );

      const { authHeaderRequest } = await import('@/pages/api/v2/chat/completions');

      await expect(
        authHeaderRequest({
          req: mockReq as NextApiRequest,
          appId: 'appId',
          chatId: 'chatId'
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });
  });
});
