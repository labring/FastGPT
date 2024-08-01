import type { NextApiRequest, NextApiResponse } from 'next';
import { GetResDataProps } from '@/global/core/chat/api';
import { jsonRes } from '@fastgpt/service/common/response';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { NextAPI } from '@/service/middleware/entry';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { appId, chatId, dataId } = req.body as GetResDataProps;
  if (!chatId || !dataId) {
    return jsonRes(res);
  }
  await authChatCrud({
    req,
    authToken: true,
    appId,
    ...req.query,
    per: ReadPermissionVal
  });

  const chatData = await MongoChatItem.findOne({
    appId,
    chatId,
    dataId
  });

  if (chatData?.obj === ChatRoleEnum.AI) {
    jsonRes(res, {
      data: chatData.responseData
    });
  } else {
    return jsonRes(res);
  }
}

export default NextAPI(handler);
