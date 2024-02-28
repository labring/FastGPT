import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { GetHistoriesProps } from '@/global/core/chat/api';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, shareId, outLinkUid, teamId, teamToken } = req.body as GetHistoriesProps;

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

    const data = await MongoChat.find(match, 'chatId title top customTitle appId updateTime')
      .sort({ top: -1, updateTime: -1 })
      .limit(limit);

    jsonRes<ChatHistoryItemType[]>(res, {
      data: data.map((item) => ({
        chatId: item.chatId,
        updateTime: item.updateTime,
        appId: item.appId,
        customTitle: item.customTitle,
        title: item.title,
        top: item.top
      }))
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
