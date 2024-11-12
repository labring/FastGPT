import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { GetHistoriesProps } from '@/global/core/chat/api';
export type getHistoriesQuery = {};

export type getHistoriesBody = PaginationProps<GetHistoriesProps>;

export type getHistoriesResponse = {};

async function handler(
  req: ApiRequestProps<getHistoriesBody, getHistoriesQuery>,
  res: ApiResponseType<any>
): Promise<PaginationResponse<getHistoriesResponse>> {
  const { appId, shareId, outLinkUid, teamId, teamToken, offset, pageSize, source } =
    req.body as getHistoriesBody;

  const match = await (async () => {
    if (shareId && outLinkUid) {
      const { uid } = await authOutLink({ shareId, outLinkUid });

      return {
        shareId,
        outLinkUid: uid,
        updateTime: {
          $gte: new Date(new Date().setDate(new Date().getDate() - 30))
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
        source
      };
    }
  })();

  if (!match) {
    return {
      list: [],
      total: 0
    };
  }

  const [data, total] = await Promise.all([
    await MongoChat.find(match, 'chatId title top customTitle appId updateTime')
      .sort({ top: -1, updateTime: -1 })
      .skip(offset)
      .limit(pageSize),
    MongoChat.countDocuments(match)
  ]);

  return {
    list: data.map((item) => ({
      chatId: item.chatId,
      updateTime: item.updateTime,
      appId: item.appId,
      customTitle: item.customTitle,
      title: item.title,
      top: item.top
    })),
    total
  };
}

export default NextAPI(handler);
