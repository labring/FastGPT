import type { NextApiResponse } from 'next';
import { UpdateHistoryBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { buildChatHistoryMatch } from '@/service/core/chat/history';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

/** 更新会话标题、用户自定义标题或置顶状态，并限制操作范围为当前用户有权访问的会话。 */
export async function handler(req: ApiRequestProps, _res: NextApiResponse) {
  const { sourceType, sourceId, chatId, title, customTitle, top, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: UpdateHistoryBodySchema
  }).body;

  // App 历史属于用户个人数据；Skill Edit 历史仍要求资源写权限。
  const per = sourceType === ChatSourceTypeEnum.skillEdit ? WritePermissionVal : ReadPermissionVal;
  const match = await buildChatHistoryMatch({
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per
  });
  if (!match) return Promise.reject(ChatErrEnum.unAuthChat);

  await MongoChat.updateOne(
    { ...match, chatId },
    {
      updateTime: new Date(),
      ...(title !== undefined && { title }),
      ...(customTitle !== undefined && { customTitle }),
      ...(top !== undefined && { top })
    }
  );
}

export default NextAPI(handler);
