import { ChatSchema } from '@fastgpt/global/core/chat/type';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { authOutLink } from './outLink';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { authUserRole } from '@fastgpt/service/support/permission/auth/user';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

/* 
  outLink: Must be the owner
  token: team owner and chat owner have all permissions
*/
export async function autChatCrud({
  appId,
  chatId,
  shareId,
  outLinkUid,
  per = 'owner',
  ...props
}: AuthModeType & {
  appId: string;
  chatId?: string;
  shareId?: string;
  outLinkUid?: string;
}): Promise<{
  chat?: ChatSchema;
  isOutLink: boolean;
  uid?: string;
}> {
  const isOutLink = Boolean(shareId && outLinkUid);
  if (!chatId) return { isOutLink, uid: outLinkUid };

  const chat = await MongoChat.findOne({ appId, chatId }).lean();

  if (!chat) return { isOutLink, uid: outLinkUid };

  const { uid } = await (async () => {
    // outLink Auth
    if (shareId && outLinkUid) {
      const { uid } = await authOutLink({ shareId, outLinkUid });

      // auth outLinkUid
      if (chat.shareId === shareId && chat.outLinkUid === uid) {
        return { uid };
      }
      return Promise.reject(ChatErrEnum.unAuthChat);
    }

    // req auth
    const { teamId, tmbId, role } = await authUserRole(props);

    if (String(teamId) !== String(chat.teamId)) return Promise.reject(ChatErrEnum.unAuthChat);

    if (role === TeamMemberRoleEnum.owner) return { uid: outLinkUid };
    if (String(tmbId) === String(chat.tmbId)) return { uid: outLinkUid };

    // admin
    if (per === 'r' && role === TeamMemberRoleEnum.admin) return { uid: outLinkUid };

    return Promise.reject(ChatErrEnum.unAuthChat);
  })();

  return {
    chat,
    isOutLink,
    uid
  };
}
