import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps, type ApiResponseType } from '@fastgpt/service/type/next';
import {
  GetHistoriesBodySchema,
  GetHistoriesResponseSchema,
  type GetHistoriesResponseType
} from '@fastgpt/global/openapi/core/chat/history/api';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { addMonths } from 'date-fns';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';

/* get chat histories list */
export async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType
): Promise<GetHistoriesResponseType> {
  const {
    appId,
    shareId,
    outLinkUid,
    teamId,
    teamToken,
    source,
    startCreateTime,
    endCreateTime,
    startUpdateTime,
    endUpdateTime
  } = GetHistoriesBodySchema.parse(req.body);
  const { offset, pageSize } = parsePaginationRequest(req);

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
        teamId,
        appId,
        outLinkUid: uid,
        source: ChatSourceEnum.team
      };
    }
    if (appId) {
      const { tmbId } = await authCert({ req, authToken: true, authApiKey: true });
      return {
        tmbId,
        appId,
        ...(source && { source })
      };
    }
  })();

  if (!match) {
    return {
      list: [],
      total: 0
    };
  }

  if (match.appId && !ObjectIdSchema.safeParse(match.appId).success) {
    return {
      list: [],
      total: 0
    };
  }

  const timeMatch: Record<string, any> = {};
  if (startCreateTime || endCreateTime) {
    timeMatch.createTime = {
      ...(startCreateTime && { $gte: new Date(startCreateTime) }),
      ...(endCreateTime && { $lte: new Date(endCreateTime) })
    };
  }
  if (startUpdateTime || endUpdateTime) {
    timeMatch.updateTime = {
      ...(startUpdateTime && { $gte: new Date(startUpdateTime) }),
      ...(endUpdateTime && { $lte: new Date(endUpdateTime) })
    };
  }

  const mergeMatch = { ...match, ...timeMatch, deleteTime: null };

  const [data, total] = await Promise.all([
    await MongoChat.find(mergeMatch, 'chatId title top customTitle appId updateTime')
      .sort({ top: -1, updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoChat.countDocuments(mergeMatch)
  ]);

  return GetHistoriesResponseSchema.parse({
    list: data.map((item) => ({
      chatId: item.chatId,
      updateTime: item.updateTime,
      appId: item.appId,
      customTitle: item.customTitle,
      title: item.title,
      top: item.top
    })),
    total
  });
}

export default NextAPI(handler);
