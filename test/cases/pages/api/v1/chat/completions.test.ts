import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextApiRequest, NextApiResponse } from 'next';
import {
  handler,
  authShareChat,
  authTeamSpaceChat,
  authHeaderRequest
} from '@/pages/api/v1/chat/completions';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { authOutLinkChatStart } from '@/service/support/permission/auth/outLink';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';

vi.mock('@fastgpt/service/core/app/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/app/schema')>();
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

vi.mock('@/service/support/permission/auth/outLink');
vi.mock('@/service/support/permission/auth/team');
vi.mock('@fastgpt/service/support/permission/auth/common');
vi.mock('@fastgpt/service/support/permission/app/auth');
vi.mock('@fastgpt/service/support/permission/auth/team');

describe('chat completions', () => {
  let mockReq: Partial<NextApiRequest>;
  let mockRes: Partial<NextApiResponse>;

  beforeEach(() => {
    mockReq = {
      body: {
        messages: [],
        stream: false,
        variables: {}
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
    it('should reject if app not found', async () => {
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
      });

      vi.mocked(MongoApp.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(
        authShareChat({
          shareId: 'shareId',
          outLinkUid: 'uid',
          ip: '127.0.0.1',
          question: 'test'
        })
      ).rejects.toEqual('app is empty');
    });

    it('should reject if chat auth fails', async () => {
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
      });

      vi.mocked(MongoApp.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'appId'
        })
      });

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          shareId: 'wrongShareId',
          outLinkUid: 'wrongUid'
        })
      });

      await expect(
        authShareChat({
          shareId: 'shareId',
          outLinkUid: 'uid',
          chatId: 'chatId',
          ip: '127.0.0.1',
          question: 'test'
        })
      ).rejects.toEqual(ChatErrEnum.unAuthChat);
    });

    it('should return auth response for valid share chat', async () => {
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
      });

      vi.mocked(MongoApp.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'appId'
        })
      });

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      const result = await authShareChat({
        shareId: 'shareId',
        outLinkUid: 'uid',
        ip: '127.0.0.1',
        question: 'test'
      });

      expect(result).toEqual({
        teamId: 'teamId',
        tmbId: 'tmbId',
        timezone: 'UTC',
        externalProvider: {},
        app: { _id: 'appId' },
        apikey: '',
        authType: AuthUserTypeEnum.outLink,
        responseAllData: false,
        responseDetail: false,
        outLinkUserId: 'uid',
        showNodeStatus: false,
        sourceName: 'test'
      });
    });
  });

  describe('authTeamSpaceChat', () => {
    it('should reject if app not found', async () => {
      vi.mocked(authTeamSpaceToken).mockResolvedValue({
        uid: 'uid'
      });

      vi.mocked(MongoApp.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(
        authTeamSpaceChat({
          appId: 'appId',
          teamId: 'teamId',
          teamToken: 'token',
          chatId: 'chatId'
        })
      ).rejects.toEqual('app is empty');
    });

    it('should reject if chat auth fails', async () => {
      vi.mocked(authTeamSpaceToken).mockResolvedValue({
        uid: 'uid'
      });

      vi.mocked(MongoApp.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'appId',
          tmbId: 'tmbId'
        })
      });

      vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
        timezone: 'UTC',
        externalProvider: {}
      });

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          teamId: 'wrongTeamId',
          outLinkUid: 'wrongUid'
        })
      });

      await expect(
        authTeamSpaceChat({
          appId: 'appId',
          teamId: 'teamId',
          teamToken: 'token',
          chatId: 'chatId'
        })
      ).rejects.toEqual(ChatErrEnum.unAuthChat);
    });

    it('should return auth response for valid team space chat', async () => {
      vi.mocked(authTeamSpaceToken).mockResolvedValue({
        uid: 'uid'
      });

      vi.mocked(MongoApp.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'appId',
          tmbId: 'tmbId'
        })
      });

      vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
        timezone: 'UTC',
        externalProvider: {}
      });

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      const result = await authTeamSpaceChat({
        appId: 'appId',
        teamId: 'teamId',
        teamToken: 'token',
        chatId: 'chatId'
      });

      expect(result).toEqual({
        teamId: 'teamId',
        tmbId: 'tmbId',
        app: { _id: 'appId', tmbId: 'tmbId' },
        timezone: 'UTC',
        externalProvider: {},
        authType: AuthUserTypeEnum.outLink,
        apikey: '',
        responseAllData: false,
        responseDetail: true,
        outLinkUserId: 'uid'
      });
    });
  });

  describe('authHeaderRequest', () => {
    it('should reject if apikey app not found', async () => {
      vi.mocked(authCert).mockResolvedValue({
        appId: 'appId',
        teamId: 'teamId',
        tmbId: 'tmbId',
        authType: AuthUserTypeEnum.apikey,
        sourceName: 'test',
        apikey: 'key'
      });

      vi.mocked(MongoApp.findById).mockReturnValue(null);

      await expect(
        authHeaderRequest({
          req: mockReq as NextApiRequest,
          appId: 'appId'
        })
      ).rejects.toEqual('app is empty');
    });

    it('should reject if chat auth fails', async () => {
      vi.mocked(authCert).mockResolvedValue({
        appId: 'appId',
        teamId: 'teamId',
        tmbId: 'tmbId',
        authType: AuthUserTypeEnum.token,
        sourceName: 'test',
        apikey: 'key'
      });

      vi.mocked(authApp).mockResolvedValue({
        app: { _id: 'appId' }
      });

      vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
        timezone: 'UTC',
        externalProvider: {}
      });

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          teamId: 'wrongTeamId',
          tmbId: 'wrongTmbId'
        })
      });

      await expect(
        authHeaderRequest({
          req: mockReq as NextApiRequest,
          appId: 'appId',
          chatId: 'chatId'
        })
      ).rejects.toEqual(ChatErrEnum.unAuthChat);
    });

    it('should return auth response for valid header request', async () => {
      vi.mocked(authCert).mockResolvedValue({
        appId: 'appId',
        teamId: 'teamId',
        tmbId: 'tmbId',
        authType: AuthUserTypeEnum.token,
        sourceName: 'test',
        apikey: 'key'
      });

      vi.mocked(authApp).mockResolvedValue({
        app: { _id: 'appId' }
      });

      vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
        timezone: 'UTC',
        externalProvider: {}
      });

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      const result = await authHeaderRequest({
        req: mockReq as NextApiRequest,
        appId: 'appId',
        chatId: 'chatId'
      });

      expect(result).toEqual({
        teamId: 'teamId',
        tmbId: 'tmbId',
        timezone: 'UTC',
        externalProvider: {},
        app: { _id: 'appId' },
        apikey: 'key',
        authType: AuthUserTypeEnum.token,
        sourceName: 'test',
        responseAllData: true,
        responseDetail: true
      });
    });
  });
});
