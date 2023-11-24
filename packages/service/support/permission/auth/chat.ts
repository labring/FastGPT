import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { AuthModeType } from '../type';
import type { ChatWithAppSchema } from '@fastgpt/global/core/chat/type';
import { parseHeaderCert } from '../controller';
import { MongoChat } from '../../../core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getTeamInfoByTmbId } from '../../user/team/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';

export async function authChat({
  chatId,
  per = 'owner',
  ...props
}: AuthModeType & {
  chatId: string;
}): Promise<
  AuthResponseType & {
    chat: ChatWithAppSchema;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderCert(props);
  const { role } = await getTeamInfoByTmbId({ tmbId });

  const { chat, isOwner, canWrite } = await (async () => {
    // get chat
    const chat = (await MongoChat.findOne({ chatId, teamId })
      .populate('appId')
      .lean()) as ChatWithAppSchema;

    if (!chat) {
      return Promise.reject('Chat is not exists');
    }

    const isOwner = role === TeamMemberRoleEnum.owner || String(chat.tmbId) === tmbId;
    const canWrite = isOwner;

    if (
      per === 'r' &&
      role !== TeamMemberRoleEnum.owner &&
      chat.appId.permission !== PermissionTypeEnum.public
    ) {
      return Promise.reject(ChatErrEnum.unAuthChat);
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
