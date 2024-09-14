import { connectToDatabase } from '@/service/mongo';
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
  try {
    await connectToDatabase();
    const { appId, shareId, outLinkUid, teamId, teamToken, current, pageSize } =
      req.body as getHistoriesBody;

    const limit = shareId && outLinkUid ? 20 : 30;

    const match = await (async () => {
      if (shareId && outLinkUid) {
        const { uid } = await authOutLink({ shareId, outLinkUid });

        return {
          shareId,
          outLinkUid: uid,
          source: ChatSourceEnum.share,
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
        const { tmbId } = await authCert({ req, authToken: true });
        return {
          tmbId,
          appId,
          source: ChatSourceEnum.online
        };
      }

      return Promise.reject('Params are error');
    })();

    const [data, total] = await Promise.all([
      await MongoChat.find(match, 'chatId title top customTitle appId updateTime')
        .sort({ top: -1, updateTime: -1 })
        .skip((current - 1) * pageSize)
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
  } catch (err) {
    return Promise.reject(err);
  }
}

export default NextAPI(handler);
