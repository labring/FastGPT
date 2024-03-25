import { ChatSchema } from '@fastgpt/global/core/chat/type';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { authOutLink, authOutLinkInit } from './outLink';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { authUserRole } from '@fastgpt/service/support/permission/auth/user';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { authTeamSpaceToken } from './team';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authOutLinkValid } from '@fastgpt/service/support/permission/auth/outLink';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
/* 
  outLink: Must be the owner
  token: team owner and chat owner have all permissions
*/
export async function autChatCrud({
  appId,
  chatId,
  shareId,
  outLinkUid,

  teamId: spaceTeamId,
  teamToken,
  per = 'owner',
  ...props
}: AuthModeType & {
  appId: string;
  chatId?: string;
  shareId?: string;
  outLinkUid?: string;

  teamId?: string;
  teamToken?: string;
}): Promise<{
  chat?: ChatSchema;
  isOutLink: boolean;
  uid?: string;
}> {
  const isOutLink = Boolean((shareId || spaceTeamId) && outLinkUid);
  if (!chatId) return { isOutLink, uid: outLinkUid };

  const chat = await MongoChat.findOne({ appId, chatId }).lean();

  const { uid } = await (async () => {
    // outLink Auth
    if (shareId && outLinkUid) {
      const { uid } = await authOutLink({ shareId, outLinkUid });
      if (!chat || (chat.shareId === shareId && chat.outLinkUid === uid)) {
        return { uid };
      }
      return Promise.reject(ChatErrEnum.unAuthChat);
    }
    // auth team space chat
    if (spaceTeamId && teamToken) {
      const { uid } = await authTeamSpaceToken({ teamId: spaceTeamId, teamToken });
      if (!chat || (String(chat.teamId) === String(spaceTeamId) && chat.outLinkUid === uid)) {
        return { uid };
      }
      return Promise.reject(ChatErrEnum.unAuthChat);
    }

    if (!chat) return { id: outLinkUid };

    //  auth req
    const { teamId, tmbId, role } = await authUserRole(props);

    if (String(teamId) !== String(chat.teamId)) return Promise.reject(ChatErrEnum.unAuthChat);

    if (role === TeamMemberRoleEnum.owner) return { uid: outLinkUid };
    if (String(tmbId) === String(chat.tmbId)) return { uid: outLinkUid };

    // admin
    if (per === 'r' && role === TeamMemberRoleEnum.admin) return { uid: outLinkUid };

    return Promise.reject(ChatErrEnum.unAuthChat);
  })();

  if (!chat) return { isOutLink, uid };

  return {
    chat,
    isOutLink,
    uid
  };
}

/* 
  Different chat source
  1. token (header)
  2. apikey (header)
  3. share page (body: shareId outLinkUid)
  4. team chat page (body: teamId teamToken)
*/
export async function authChatCert(props: AuthModeType) {
  const { teamId, teamToken, shareId, outLinkUid } = props.req.body as OutLinkChatAuthProps;

  if (shareId && outLinkUid) {
    const { shareChat } = await authOutLinkValid({ shareId });
    const { uid } = await authOutLinkInit({
      outLinkUid,
      tokenUrl: shareChat.limit?.hookUrl
    });

    return {
      teamId: String(shareChat.teamId),
      tmbId: String(shareChat.tmbId),
      authType: AuthUserTypeEnum.outLink,
      apikey: '',
      isOwner: false,
      canWrite: false,
      outLinkUid: uid
    };
  }
  if (teamId && teamToken) {
    const { uid } = await authTeamSpaceToken({ teamId, teamToken });
    const tmb = await MongoTeamMember.findOne(
      { teamId, role: TeamMemberRoleEnum.owner },
      'tmbId'
    ).lean();

    if (!tmb) return Promise.reject(ChatErrEnum.unAuthChat);

    return {
      teamId,
      tmbId: String(tmb._id),
      authType: AuthUserTypeEnum.teamDomain,
      apikey: '',
      isOwner: false,
      canWrite: false,
      outLinkUid: uid
    };
  }

  return authCert(props);
}
