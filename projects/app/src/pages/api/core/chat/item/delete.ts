import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import type { DeleteChatItemProps } from '@/global/core/chat/api.d';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppApikey } from '@fastgpt/service/support/permission/app/auth';

async function handler(req: ApiRequestProps<{}, DeleteChatItemProps>, res: NextApiResponse) {
  const { chatId, contentId } = req.query;

  let appId = req.query.appId;
  if (!contentId || !chatId) {
    return jsonRes(res);
  }
  if (appId) {
    await authChatCrud({
      req,
      authToken: true,
      ...req.query,
      per: WritePermissionVal
    });
  } else {
    const { appId: apiKeyAppId } = await authAppApikey({ req });
    appId = apiKeyAppId!;
  }

  await MongoChatItem.deleteOne({
    appId,
    chatId,
    dataId: contentId
  });

  jsonRes(res);
}

export default NextAPI(handler);
