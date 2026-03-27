import { subDays } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const mocks = vi.hoisted(() => ({
  deleteSandboxesByChatIds: vi.fn().mockResolvedValue(undefined),
  deleteChatFilesByPrefix: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/core/ai/sandbox/controller', () => ({
  deleteSandboxesByChatIds: mocks.deleteSandboxesByChatIds
}));

vi.mock('@fastgpt/service/common/s3/sources/chat/index', () => ({
  getS3ChatSource: vi.fn(() => ({
    deleteChatFilesByPrefix: mocks.deleteChatFilesByPrefix
  }))
}));

import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import {
  cleanupExpiredAppChatLogs,
  cleanupExpiredAuditLogs,
  cleanupExpiredChatHistories
} from '@/service/common/system/dataRetention';

const newObjectId = () => new Types.ObjectId().toString();

describe('dataRetention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes expired chat history trees and keeps recent data', async () => {
    const teamId = newObjectId();
    const tmbId = newObjectId();
    const appId = newObjectId();
    const oldChatId = 'chat-old';
    const recentChatId = 'chat-recent';
    const oldTime = subDays(new Date(), 10);
    const recentTime = subDays(new Date(), 2);

    await MongoChat.create([
      {
        teamId,
        tmbId,
        appId,
        chatId: oldChatId,
        source: ChatSourceEnum.online,
        createTime: oldTime,
        updateTime: oldTime
      },
      {
        teamId,
        tmbId,
        appId,
        chatId: recentChatId,
        source: ChatSourceEnum.online,
        createTime: recentTime,
        updateTime: recentTime
      }
    ]);

    await MongoChatItem.create([
      {
        teamId,
        tmbId,
        appId,
        chatId: oldChatId,
        dataId: 'old-item',
        obj: ChatRoleEnum.Human,
        value: [],
        time: oldTime
      },
      {
        teamId,
        tmbId,
        appId,
        chatId: recentChatId,
        dataId: 'recent-item',
        obj: ChatRoleEnum.Human,
        value: [],
        time: recentTime
      }
    ]);

    await MongoChatItemResponse.create([
      {
        teamId,
        appId,
        chatId: oldChatId,
        chatItemDataId: 'old-item',
        data: { answer: 'old' },
        time: oldTime
      },
      {
        teamId,
        appId,
        chatId: recentChatId,
        chatItemDataId: 'recent-item',
        data: { answer: 'recent' },
        time: recentTime
      }
    ]);

    await MongoAppChatLog.create([
      {
        teamId,
        appId,
        chatId: oldChatId,
        userId: 'user-old',
        source: ChatSourceEnum.online,
        createTime: oldTime,
        updateTime: oldTime
      },
      {
        teamId,
        appId,
        chatId: recentChatId,
        userId: 'user-recent',
        source: ChatSourceEnum.online,
        createTime: recentTime,
        updateTime: recentTime
      }
    ]);

    const result = await cleanupExpiredChatHistories({
      retentionDays: 7,
      batchSize: 1
    });

    expect(result.enabled).toBe(true);
    expect(result.deletedChatCount).toBe(1);
    expect(result.deletedChatItemCount).toBe(1);
    expect(result.deletedChatItemResponseCount).toBe(1);
    expect(result.deletedChatLogCount).toBe(1);

    expect(await MongoChat.findOne({ appId, chatId: oldChatId })).toBeNull();
    expect(await MongoChatItem.findOne({ appId, chatId: oldChatId })).toBeNull();
    expect(await MongoChatItemResponse.findOne({ appId, chatId: oldChatId })).toBeNull();
    expect(await MongoAppChatLog.findOne({ appId, chatId: oldChatId })).toBeNull();

    expect(await MongoChat.findOne({ appId, chatId: recentChatId })).not.toBeNull();
    expect(await MongoChatItem.findOne({ appId, chatId: recentChatId })).not.toBeNull();
    expect(await MongoChatItemResponse.findOne({ appId, chatId: recentChatId })).not.toBeNull();
    expect(await MongoAppChatLog.findOne({ appId, chatId: recentChatId })).not.toBeNull();

    expect(mocks.deleteSandboxesByChatIds).toHaveBeenCalledWith({
      appId,
      chatIds: [oldChatId]
    });
    expect(mocks.deleteChatFilesByPrefix).toHaveBeenCalledWith({
      appId,
      chatId: oldChatId,
      uId: tmbId
    });
  });

  it('deletes expired app chat logs only', async () => {
    const teamId = newObjectId();
    const appId = newObjectId();
    const oldTime = subDays(new Date(), 9);
    const recentTime = subDays(new Date(), 1);

    await MongoAppChatLog.create([
      {
        teamId,
        appId,
        chatId: 'old-log',
        userId: 'user-old',
        source: ChatSourceEnum.online,
        createTime: oldTime,
        updateTime: oldTime
      },
      {
        teamId,
        appId,
        chatId: 'recent-log',
        userId: 'user-recent',
        source: ChatSourceEnum.online,
        createTime: recentTime,
        updateTime: recentTime
      }
    ]);

    const result = await cleanupExpiredAppChatLogs({ retentionDays: 7 });

    expect(result).toMatchObject({
      enabled: true,
      retentionDays: 7,
      deletedCount: 1
    });
    expect(await MongoAppChatLog.findOne({ chatId: 'old-log' })).toBeNull();
    expect(await MongoAppChatLog.findOne({ chatId: 'recent-log' })).not.toBeNull();
  });

  it('deletes expired audit logs only', async () => {
    const teamId = newObjectId();
    const tmbId = newObjectId();
    const oldTime = subDays(new Date(), 15);
    const recentTime = subDays(new Date(), 3);

    await MongoTeamAudit.create([
      {
        teamId,
        tmbId,
        event: AuditEventEnum.LOGIN,
        timestamp: oldTime
      },
      {
        teamId,
        tmbId,
        event: AuditEventEnum.LOGIN,
        timestamp: recentTime
      }
    ]);

    const result = await cleanupExpiredAuditLogs({ retentionDays: 7 });

    expect(result).toMatchObject({
      enabled: true,
      retentionDays: 7,
      deletedCount: 1
    });
    expect(
      await MongoTeamAudit.countDocuments({
        timestamp: { $lt: subDays(new Date(), 7) }
      })
    ).toBe(0);
    expect(await MongoTeamAudit.countDocuments()).toBe(1);
  });
});
