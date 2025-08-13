import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handler,
  authShareChat,
  authTeamSpaceChat,
  authHeaderRequest
} from '@/pages/api/v2/chat/completions';
import { NextApiRequest, NextApiResponse } from 'next';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { authOutLinkChatStart } from '@fastgpt/service/support/permission/auth/outLink';
import {
  authTeamSpaceToken,
  getUserChatInfoAndAuthTeamPoints
} from '@fastgpt/service/support/permission/auth/team';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { UserError } from '@fastgpt/global/common/error/utils';

vi.mock('@fastgpt/service/core/app/schema', async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/service/core/app/schema')>(
    '@fastgpt/service/core/app/schema'
  );
  return {
    ...actual,
    MongoApp: {
      findById: vi.fn()
    }
  };
});

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/auth/outLink', () => ({
  authOutLinkChatStart: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/team', () => ({
  authTeamSpaceToken: vi.fn(),
  getUserChatInfoAndAuthTeamPoints: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn()
}));

describe('chat/completions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authShareChat', () => {
    it('should throw error when app not found', async () => {
      vi.mocked(MongoApp.findById).mockResolvedValueOnce(null);
      vi.mocked(authOutLinkChatStart).mockResolvedValueOnce({
        teamId: 'teamId',
        tmbId: 'tmbId',
        timezone: 'UTC',
        externalProvider: {},
        appId: 'appId',
        authType: AuthUserTypeEnum.outLink,
        responseDetail: true,
        showNodeStatus: false,
        uid: 'uid',
        sourceName: 'test'
      });

      await expect(
        authShareChat({
          shareId: 'shareId',
          outLinkUid: 'uid',
          ip: '127.0.0.1',
          question: 'test'
        })
      ).rejects.toEqual('linkUnInvalid');
    });

    it('should throw error when chat auth fails', async () => {
      const mockApp = {
        _id: 'appId'
      };

      vi.mocked(authOutLinkChatStart).mockResolvedValueOnce({
        teamId: 'teamId',
        tmbId: 'tmbId',
        timezone: 'UTC',
        externalProvider: {},
        appId: 'appId',
        authType: AuthUserTypeEnum.outLink,
        responseDetail: true,
        showNodeStatus: false,
        uid: 'uid',
        sourceName: 'test'
      });

      vi.mocked(MongoApp.findById).mockResolvedValueOnce(mockApp);
      vi.mocked(MongoChat.findOne).mockResolvedValueOnce({
        shareId: 'differentShareId',
        outLinkUid: 'differentUid'
      } as any);

      await expect(
        authShareChat({
          shareId: 'shareId',
          outLinkUid: 'uid',
          chatId: 'chatId',
          ip: '127.0.0.1',
          question: 'test'
        })
      ).rejects.toEqual('linkUnInvalid');
    });
  });

  describe('authTeamSpaceChat', () => {
    it('should throw error when app not found', async () => {
      vi.mocked(MongoApp.findById).mockResolvedValueOnce(null);
      vi.mocked(authTeamSpaceToken).mockResolvedValueOnce({ uid: 'uid' });

      await expect(
        authTeamSpaceChat({
          appId: 'appId',
          teamId: 'teamId',
          teamToken: 'token',
          chatId: 'chatId'
        })
      ).rejects.toEqual(new UserError('The request was denied...'));
    });

    it('should throw error when chat auth fails', async () => {
      const mockApp = {
        _id: 'appId',
        tmbId: 'tmbId'
      };

      vi.mocked(authTeamSpaceToken).mockResolvedValueOnce({ uid: 'uid' });
      vi.mocked(MongoApp.findById).mockResolvedValueOnce(mockApp);
      vi.mocked(MongoChat.findOne).mockResolvedValueOnce({
        teamId: 'differentTeamId',
        outLinkUid: 'differentUid'
      } as any);
      vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValueOnce({
        timezone: 'UTC',
        externalProvider: {}
      });

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
    it('should throw error when apikey app id is missing', async () => {
      vi.mocked(authCert).mockResolvedValueOnce({
        authType: AuthUserTypeEnum.apikey,
        teamId: 'teamId',
        tmbId: 'tmbId'
      } as any);

      await expect(
        authHeaderRequest({
          req: {} as NextApiRequest,
          chatId: 'chatId'
        })
      ).rejects.toEqual('Key is error. You need to use the app key rather than the account key.');
    });

    it('should throw error when token auth app id is missing', async () => {
      vi.mocked(authCert).mockResolvedValueOnce({
        authType: AuthUserTypeEnum.token,
        teamId: 'teamId',
        tmbId: 'tmbId'
      } as any);

      await expect(
        authHeaderRequest({
          req: {} as NextApiRequest,
          chatId: 'chatId'
        })
      ).rejects.toEqual('appId is empty');
    });

    it('should throw error when chat auth fails', async () => {
      const mockApp = {
        _id: 'appId',
        tmbId: 'tmbId'
      };

      vi.mocked(authCert).mockResolvedValueOnce({
        authType: AuthUserTypeEnum.token,
        teamId: 'teamId',
        tmbId: 'tmbId'
      } as any);

      vi.mocked(MongoApp.findById).mockResolvedValueOnce(mockApp);
      vi.mocked(MongoChat.findOne).mockResolvedValueOnce({
        teamId: 'differentTeamId',
        tmbId: 'differentTmbId'
      } as any);

      vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValueOnce({
        timezone: 'UTC',
        externalProvider: {}
      });

      await expect(
        authHeaderRequest({
          req: {} as NextApiRequest,
          appId: 'appId',
          chatId: 'chatId'
        })
      ).rejects.toEqual(new Error('unAuthorization'));
    });
  });
});
