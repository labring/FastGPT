import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { AuthModeType } from '../type';
import type { ChatSchema } from '@fastgpt/global/core/chat/type';
import { parseHeaderCert } from '../controller';
import { MongoChat } from '../../../core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

export async function authChat({
  chatId,
  per = 'owner',
  ...props
}: AuthModeType & {
  chatId: string;
}): Promise<
  AuthResponseType & {
    chat: ChatSchema;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderCert(props);

  const { chat, isOwner, canWrite } = await (async () => {
    // get chat
    const chat = (await MongoChat.findOne({ chatId, teamId }))?.toJSON();

    if (!chat) {
      return Promise.reject('Chat is not exists');
    }

    const isOwner = String(chat.tmbId) === tmbId;
    const canWrite = isOwner;

    if (per === 'r') {
      if (!isOwner) {
        return Promise.reject(ChatErrEnum.unAuthChat);
      }
    }
    if (per === 'w' && !canWrite) {
      return Promise.reject(ChatErrEnum.unAuthChat);
    }
    if (per === 'owner' && !isOwner) {
      return Promise.reject(ChatErrEnum.unAuthChat);
    }

    return {
      chat,
      isOwner,
      canWrite
    };
  })();

  return {
    userId,
    teamId,
    tmbId,
    chat,
    isOwner,
    canWrite
  };
}
