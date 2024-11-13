import { ChatSchema } from '@fastgpt/global/core/chat/type';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { authOutLink, authOutLinkInit } from './outLink';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { authTeamSpaceToken } from './team';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { authOutLinkValid } from '@fastgpt/service/support/permission/publish/authLink';
import {
  AuthUserTypeEnum,
  OwnerPermissionVal,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { addLog } from '@fastgpt/service/common/system/log';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
/* 
  outLink: Must be the owner
  token: team owner and chat owner have all permissions
*/
export async function authChatCrud({
  appId,
  chatId,
  shareId,
  outLinkUid,

  teamId: spaceTeamId,
  teamToken,
  per = OwnerPermissionVal,
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
  responseDetail: boolean;
}> {
  const isOutLink = Boolean((shareId || spaceTeamId) && outLinkUid);
  if (!chatId) return { isOutLink, uid: outLinkUid, responseDetail: true };

  const chat = await MongoChat.findOne({ appId, chatId }).lean();

  const { uid, responseDetail } = await (async () => {
    // outLink Auth
    if (shareId && outLinkUid) {
      const { uid, shareChat } = await authOutLink({ shareId, outLinkUid });
      if (!chat || (chat.shareId === shareId && chat.outLinkUid === uid)) {
        return { uid, responseDetail: shareChat.responseDetail };
      }
      return Promise.reject(ChatErrEnum.unAuthChat);
    }
    // auth team space chat
    if (spaceTeamId && teamToken) {
      const { uid } = await authTeamSpaceToken({ teamId: spaceTeamId, teamToken });
      addLog.debug('Auth team token', { uid, spaceTeamId, teamToken, chatUid: chat?.outLinkUid });
      if (!chat || (String(chat.teamId) === String(spaceTeamId) && chat.outLinkUid === uid)) {
        return { uid, responseDetail: true };
      }
      return Promise.reject(ChatErrEnum.unAuthChat);
    }

    if (!chat) return { id: outLinkUid, responseDetail: true };

    // auth req
    const { teamId, tmbId, permission } = await authApp({
      req: props.req,
      authToken: true,
      authApiKey: true,
      appId,
      per: ReadPermissionVal
    });

    if (String(teamId) !== String(chat.teamId)) return Promise.reject(ChatErrEnum.unAuthChat);

    if (permission.hasManagePer) return { uid: outLinkUid, responseDetail: true };
    if (String(tmbId) === String(chat.tmbId)) return { uid: outLinkUid, responseDetail: true };

    return Promise.reject(ChatErrEnum.unAuthChat);
  })();

  if (!chat) return { isOutLink, uid, responseDetail };

  return {
    chat,
    isOutLink,
    uid,
    responseDetail
  };
}

/* 
  Different chat source
  1. token (header)
  2. apikey (header)
  3. share page (body: shareId outLinkUid)
  4. team chat page (body: teamId teamToken)
*/
export async function authChatCert(props: AuthModeType): Promise<{
  teamId: string;
  tmbId: string;
  authType: AuthUserTypeEnum;
  apikey: string;
  isOwner: boolean;
  canWrite: boolean;
  outLinkUid?: string;
}> {
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
