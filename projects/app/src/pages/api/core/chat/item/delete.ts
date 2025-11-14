import type { NextApiResponse } from 'next';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import type { DeleteChatItemProps } from '@/global/core/chat/api.d';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';

async function handler(req: ApiRequestProps<DeleteChatItemProps>, res: NextApiResponse) {
  const { appId, chatId, contentId, delFile = true } = req.body;

  if (!contentId || !chatId) {
    return Promise.reject('contentId or chatId is empty');
  }

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.body
  });

  await mongoSessionRun(async (session) => {
    await MongoChatItemResponse.deleteMany({
      appId,
      chatId,
      chatItemDataId: contentId
    }).session(session);

    const item = await MongoChatItem.findOneAndDelete({
      appId,
      chatId,
      dataId: contentId
    }).session(session);

    if (item?.obj === ChatRoleEnum.Human && delFile) {
      const s3ChatSource = getS3ChatSource();
      for (const value of item.value) {
        if (value.type === ChatItemValueTypeEnum.file && value.file?.key) {
          await s3ChatSource.deleteChatFileByKey(value.file.key);
        }
      }
    }
  });

  return;
}

export default NextAPI(handler);
