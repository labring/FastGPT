import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import type { ChatSchemaType } from '@fastgpt/global/core/chat/type';
import { surrenderProcess } from '@fastgpt/service/common/system/tools';

export type SyncAppChatLogQuery = {};

export type SyncAppChatLogBody = {
  batchSize?: number;
};

export type SyncAppChatLogResponse = {};

/* 
    将 chats 表全部扫一遍，来获取统计数据
*/
async function handler(
  req: ApiRequestProps<SyncAppChatLogBody, SyncAppChatLogQuery>,
  res: ApiResponseType<SyncAppChatLogResponse>
) {
  await authCert({ req, authRoot: true });

  const { batchSize = 10 } = req.body;

  console.log('开始同步AppChatLog数据...');
  console.log(`批处理大小: ${batchSize}`);

  let success = 0;
  const total = await MongoChat.countDocuments({});
  console.log(`总共需要处理的chat记录数: ${total}`);

  res.json({
    data: '同步任务已开始，可在日志中看到进度'
  });

  while (true) {
    console.log(`对话同步处理进度: ${success}/${total}`);

    try {
      const chats = await MongoChat.find({
        initStatistics: { $exists: false }
      })
        .sort({ _id: -1 })
        .limit(batchSize)
        .lean();

      if (chats.length === 0) break;

      const result = await Promise.allSettled(chats.map((chat) => processChatRecord(chat)));
      success += result.filter((r) => r.status === 'fulfilled').length;
    } catch (error) {
      addLog.error('处理chat记录失败', error);
    }
  }

  console.log('同步对话完成');
}

async function processChatRecord(chat: ChatSchemaType) {
  async function calculateChatItemStats() {
    const chatItems = await MongoChatItem.find({ appId: chat.appId, chatId: chat.chatId })
      .limit(1000)
      .lean();

    let chatItemCount = chatItems.length;
    let errorCount = 0;
    let totalPoints = 0;
    let goodFeedbackCount = 0;
    let badFeedbackCount = 0;
    let totalResponseTime = 0;

    for (const item of chatItems) {
      await surrenderProcess();

      const itemData = item as any;

      if (itemData.userGoodFeedback && itemData.userGoodFeedback.trim() !== '') {
        goodFeedbackCount++;
      }
      if (itemData.userBadFeedback && itemData.userBadFeedback.trim() !== '') {
        badFeedbackCount++;
      }

      if (itemData.durationSeconds) {
        totalResponseTime += itemData.durationSeconds;
      } else if (
        itemData[DispatchNodeResponseKeyEnum.nodeResponse] &&
        Array.isArray(itemData[DispatchNodeResponseKeyEnum.nodeResponse])
      ) {
        for (const response of itemData[DispatchNodeResponseKeyEnum.nodeResponse]) {
          if (response.runningTime) {
            totalResponseTime += response.runningTime / 1000;
          }
        }
      }

      if (
        itemData[DispatchNodeResponseKeyEnum.nodeResponse] &&
        Array.isArray(itemData[DispatchNodeResponseKeyEnum.nodeResponse])
      ) {
        for (const response of itemData[DispatchNodeResponseKeyEnum.nodeResponse]) {
          if (response.errorText) {
            errorCount++;
            break;
          }

          if (response.totalPoints) {
            totalPoints += response.totalPoints;
          }
        }
      }
    }

    return {
      chatItemCount,
      errorCount,
      totalPoints,
      goodFeedbackCount,
      badFeedbackCount,
      totalResponseTime
    };
  }

  async function checkIsFirstChat(): Promise<boolean> {
    const earliestChat = await MongoChat.findOne(
      {
        appId: chat.appId,
        tmbId: chat.tmbId,
        ...(chat.outLinkUid && { outLinkUid: chat.outLinkUid })
      },
      '_id'
    ).lean();

    return earliestChat?._id.toString() === chat._id.toString();
  }

  const chatItemStats = await calculateChatItemStats();
  const isFirstChat = await checkIsFirstChat();

  const chatLogData = {
    appId: chat.appId,
    teamId: chat.teamId,
    chatId: chat.chatId,
    userId: String(chat.outLinkUid || chat.tmbId),
    source: chat.source,
    sourceName: chat.sourceName,
    createTime: chat.createTime,
    updateTime: chat.updateTime,
    chatItemCount: chatItemStats.chatItemCount,
    errorCount: chatItemStats.errorCount,
    totalPoints: chatItemStats.totalPoints,
    goodFeedbackCount: chatItemStats.goodFeedbackCount,
    badFeedbackCount: chatItemStats.badFeedbackCount,
    totalResponseTime: chatItemStats.totalResponseTime,
    isFirstChat
  };

  await MongoAppChatLog.updateOne(
    { teamId: chat.teamId, appId: chat.appId, chatId: chat.chatId },
    { $set: chatLogData },
    { upsert: true }
  );
  await MongoChat.updateOne({ _id: chat._id }, { $set: { initStatistics: true } });
}

export default NextAPI(handler);
