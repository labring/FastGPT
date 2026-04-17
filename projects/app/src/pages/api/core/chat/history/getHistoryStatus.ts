import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatGenerateStatusEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps, type ApiResponseType } from '@fastgpt/service/type/next';
import {
  GetHistoryStatusBodySchema,
  GetHistoryStatusResponseSchema,
  type GetHistoryStatusResponseType
} from '@fastgpt/global/openapi/core/chat/history/api';
import { addMonths } from 'date-fns';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';

/* Batch get chatGenerateStatus / hasBeenRead for sidebar sync */
export async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType
): Promise<GetHistoryStatusResponseType> {
  const { appId, chatIds, shareId, outLinkUid, teamId, teamToken } =
    GetHistoryStatusBodySchema.parse(req.body);

  const match = await (async () => {
    if (shareId && outLinkUid) {
      const { uid } = await authOutLink({ shareId, outLinkUid });
      return {
        shareId,
        outLinkUid: uid,
        updateTime: {
          $gte: addMonths(new Date(), -1)
        }
      };
    }
    if (appId && teamId && teamToken) {
      const { uid } = await authTeamSpaceToken({ teamId, teamToken });
      return {
        appId,
        outLinkUid: uid,
        source: ChatSourceEnum.team
      };
    }
    if (appId) {
      const { tmbId } = await authCert({ req, authToken: true, authApiKey: true });
      return {
        appId,
        tmbId
      };
    }
  })();

  if (!match) {
    return GetHistoryStatusResponseSchema.parse({ list: [] });
  }

  if (match.appId && !ObjectIdSchema.safeParse(match.appId).success) {
    return GetHistoryStatusResponseSchema.parse({ list: [] });
  }

  const data = await MongoChat.find(
    {
      ...match,
      chatId: { $in: chatIds },
      deleteTime: null
    },
    'chatId updateTime chatGenerateStatus hasBeenRead'
  ).lean();

  return GetHistoryStatusResponseSchema.parse({
    list: data.map((item) => ({
      chatId: item.chatId,
      updateTime: item.updateTime,
      chatGenerateStatus: item.chatGenerateStatus ?? ChatGenerateStatusEnum.done,
      hasBeenRead: item.hasBeenRead
    }))
  });
}

export default NextAPI(handler);
