import { describe, expect, it, vi } from 'vitest';
import { NextApiRequest, NextApiResponse } from 'next';
import {
  handler,
  authShareChat,
  authTeamSpaceChat,
  authHeaderRequest
} from '@/pages/api/v1/chat/completions';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { authOutLinkChatStart } from '@/service/support/permission/auth/outLink';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';

vi.mock('@fastgpt/service/core/app/schema');
vi.mock('@fastgpt/service/core/chat/chatSchema');
vi.mock('@/service/support/permission/auth/outLink');
vi.mock('@/service/support/permission/auth/team');
vi.mock('@fastgpt/service/support/permission/auth/common');
vi.mock('@fastgpt/service/support/permission/app/auth');
vi.mock('@fastgpt/service/support/permission/auth/team');

describe('chat/completions', () => {
  describe('authShareChat', () => {
    it('should throw error when app not found', async () => {
      vi.mocked(authOutLinkChatStart).mockResolvedValue({
        teamId: 'teamId',
        tmbId: 'tmbId',
        timezone: 'UTC',
        externalProvider: {},
        appId: 'appId',
        authType: AuthUserTypeEnum.apikey,
        responseDetail: false,
        showNodeStatus: false,
        uid: 'uid',
        sourceName: 'test'
      });

      vi.mocked(MongoApp.findById).mockImplementation(() => ({
        lean: () => null
      }));

      await expect(
        authShareChat({
          shareId: 'shareId',
          outLinkUid: 'uid',
          ip: '127.0.0.1',
          question: 'test'
        })
      ).rejects.toBe('app is empty');
    });

    it('should throw error when chat not authorized', async () => {
      vi.mocked(authOutLinkChatStart).mockResolvedValue({
        teamId: 'teamId',
        tmbId: 'tmbId',
        timezone: 'UTC',
        externalProvider: {},
        appId: 'appId',
        authType: AuthUserTypeEnum.apikey,
        responseDetail: false,
        showNodeStatus: false,
        uid: 'uid',
        sourceName: 'test'
      });

      vi.mocked(MongoApp.findById).mockImplementation(() => ({
        lean: () => ({ _id: 'appId' })
      }));

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => ({
          shareId: 'different',
          outLinkUid: 'different'
        })
      } as any);

      await expect(
        authShareChat({
          shareId: 'shareId',
          chatId: 'chatId',
          outLinkUid: 'uid',
          ip: '127.0.0.1',
          question: 'test'
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });
  });

  describe('authTeamSpaceChat', () => {
    it('should throw error when app not found', async () => {
      vi.mocked(authTeamSpaceToken).mockResolvedValue({ uid: 'uid' });
      vi.mocked(MongoApp.findById).mockImplementation(() => ({
        lean: () => null
      }));

      await expect(
        authTeamSpaceChat({
          appId: 'appId',
          teamId: 'teamId',
          teamToken: 'token',
          chatId: 'chatId'
        })
      ).rejects.toBe('app is empty');
    });

    it('should throw error when chat not authorized', async () => {
      vi.mocked(authTeamSpaceToken).mockResolvedValue({ uid: 'uid' });
      vi.mocked(MongoApp.findById).mockImplementation(() => ({
        lean: () => ({ _id: 'appId', tmbId: 'tmbId' })
      }));

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => ({
          teamId: 'different',
          outLinkUid: 'different'
        })
      } as any);

      vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
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
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });
  });

  describe('authHeaderRequest', () => {
    it('should throw error when app id missing for API key auth', async () => {
      const req = {
        headers: {}
      } as NextApiRequest;

      vi.mocked(authCert).mockResolvedValue({
        appId: undefined,
        teamId: 'teamId',
        tmbId: 'tmbId',
        authType: AuthUserTypeEnum.apikey,
        sourceName: 'test',
        apikey: 'key'
      });

      await expect(
        authHeaderRequest({
          req,
          appId: undefined,
          chatId: 'chatId'
        })
      ).rejects.toBe('Key is error. You need to use the app key rather than the account key.');
    });

    it('should throw error when app not found for API key auth', async () => {
      const req = {
        headers: {}
      } as NextApiRequest;

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
          req,
          appId: 'appId',
          chatId: 'chatId'
        })
      ).rejects.toBe('app is empty');
    });

    it('should throw error when chat not authorized', async () => {
      const req = {
        headers: {}
      } as NextApiRequest;

      vi.mocked(authCert).mockResolvedValue({
        appId: 'appId',
        teamId: 'teamId',
        tmbId: 'tmbId',
        authType: AuthUserTypeEnum.apikey,
        sourceName: 'test',
        apikey: 'key'
      });

      vi.mocked(MongoApp.findById).mockImplementation(() => ({
        lean: () => ({ _id: 'appId', tmbId: 'tmbId' })
      }));

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => ({
          teamId: 'different',
          tmbId: 'different'
        })
      } as any);

      vi.mocked(getUserChatInfoAndAuthTeamPoints).mockResolvedValue({
        timezone: 'UTC',
        externalProvider: {}
      });

      await expect(
        authHeaderRequest({
          req,
          appId: 'appId',
          chatId: 'chatId'
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });
  });

  describe('handler', () => {
    it('should handle empty messages array', async () => {
      const req = {
        body: {
          messages: []
        },
        headers: {}
      } as NextApiRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as NextApiResponse;

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        code: 504000,
        statusText: 'unAuthChat',
        message: 'common:code_error.chat_error.un_auth',
        data: null
      });
    });
  });
});
