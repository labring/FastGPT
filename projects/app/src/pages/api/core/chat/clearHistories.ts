import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { type ClearHistoriesProps } from '@/global/core/chat/api';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';

/* 批量逻辑删除会话历史 */
async function handler(req: ApiRequestProps<{}, ClearHistoriesProps>, res: NextApiResponse) {
  const { appId, shareId, outLinkUid, teamId, teamToken } = req.query;

  const {
    teamId: chatTeamId,
    tmbId,
    uid,
    authType
  } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.query
  });

  const match = await (async () => {
    if (shareId && outLinkUid && authType === 'outLink') {
      return {
        teamId: chatTeamId,
        appId,
        outLinkUid: uid
      };
    }
    if (teamId && teamToken && authType === 'teamDomain') {
      return {
        teamId: chatTeamId,
        appId,
        outLinkUid: uid
      };
    }
    if (authType === 'token') {
      return {
        teamId: chatTeamId,
        tmbId,
        appId,
        source: ChatSourceEnum.online
      };
    }
    if (authType === 'apikey') {
      return {
        teamId: chatTeamId,
        appId,
        source: ChatSourceEnum.api
      };
    }

    return Promise.reject('Param are error');
  })();

  // find chatIds (只查找未删除的)
  const list = await MongoChat.find({ ...match, deleted: { $ne: true } }, 'chatId').lean();
  const idList = list.map((item) => item.chatId);

  if (idList.length === 0) {
    return;
  }

  // 逻辑删除：不删除文件，保留供管理员查看
  const now = new Date();

  return mongoSessionRun(async (session) => {
    // 批量标记 chatitems 为已删除
    await MongoChatItem.updateMany(
      {
        appId,
        chatId: { $in: idList }
      },
      {
        $set: {
          deleted: true,
          deletedAt: now,
          deletedBy: tmbId
        }
      },
      { session }
    );
    // 批量标记 chat 为已删除
    await MongoChat.updateMany(
      {
        appId,
        chatId: { $in: idList }
      },
      {
        $set: {
          deleted: true,
          deletedAt: now,
          deletedBy: tmbId
        }
      },
      { session }
    );
  });
}

export default NextAPI(handler);
