import type { AuthOutLinkChatProps } from '@fastgpt/global/support/outLink/api';
import { type ShareChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { authOutLinkValid } from '@fastgpt/service/support/permission/publish/authLink';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { type ShareOutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { authOutLinkInit, authOutLinkLimit } from '@fastgpt/service/support/outLink/runtime/auth';
import { isProVersion } from '@fastgpt/service/common/system/constants';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { NodeHttpRequest } from '@fastgpt/service/types/http';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { notLeaveStatus } from '@fastgpt/global/support/user/team/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

const authOutLinkAppAccess = async ({
  req,
  outLinkConfig
}: {
  req: NodeHttpRequest;
  outLinkConfig: Pick<ShareOutLinkSchemaType, 'allowAnonymous' | 'appId' | 'teamId'>;
}) => {
  if (outLinkConfig.allowAnonymous) return;

  const { userId, tmbId, isRoot } = await parseHeaderCert({ req, authToken: true });

  // A protected link belongs to one team. Resolve the authenticated user in that team
  // instead of trusting the caller-provided outLinkUid as the chat identity.
  if (isRoot) {
    await authAppByTmbId({
      tmbId,
      appId: String(outLinkConfig.appId),
      per: ReadPermissionVal,
      isRoot
    });
    return { tmbId };
  }

  const member = await MongoTeamMember.findOne({
    userId,
    teamId: outLinkConfig.teamId,
    status: notLeaveStatus
  }).lean();
  if (!member) throw AppErrEnum.unAuthApp;

  const memberTmbId = String(member._id);
  await authAppByTmbId({
    tmbId: memberTmbId,
    appId: outLinkConfig.appId,
    per: ReadPermissionVal,
    isRoot
  });

  return { tmbId: memberTmbId };
};

export const authOutLink = async ({
  shareId,
  outLinkUid,
  req
}: ShareChatAuthProps & { req: NodeHttpRequest }): Promise<{
  uid: string;
  appId: string;
  outLinkConfig: ShareOutLinkSchemaType;
}> => {
  if (!outLinkUid) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }
  const result = await authOutLinkValid({ shareId });
  const appAccess = await authOutLinkAppAccess({ req, outLinkConfig: result.outLinkConfig });

  const { uid } = await authOutLinkInit({
    outLinkUid,
    tokenUrl: result.outLinkConfig.limit?.hookUrl
  });

  return {
    ...result,
    uid: appAccess?.tmbId ?? uid
  };
};

/** 校验外链聊天请求并返回后续聊天鉴权所需的发布配置。 */
export async function authOutLinkChatStart({
  shareId,
  outLinkUid,
  question,
  req
}: AuthOutLinkChatProps & {
  shareId: string;
  req: NodeHttpRequest;
}) {
  // get outLink and app
  const { outLinkConfig, appId } = await authOutLinkValid({ shareId });
  const appAccess = await authOutLinkAppAccess({ req, outLinkConfig });

  // 社区版保持历史行为；商业版校验改为本地执行，不再依赖 Pro HTTP 接口。
  const { uid } = isProVersion()
    ? await authOutLinkLimit({ outLink: outLinkConfig, outLinkUid, question })
    : { uid: outLinkUid };

  // `tmbId` 是分享链接发布者，决定应用和团队上下文。
  // `uid` 是当前访问者，最终会作为 `outLinkUid` 持久化。
  // 两者的鉴权和审计语义不同，不可互换。
  return {
    sourceName: outLinkConfig.name,
    teamId: outLinkConfig.teamId,
    tmbId: outLinkConfig.tmbId,
    authType: AuthUserTypeEnum.token,
    showCite: outLinkConfig.showCite,
    showRunningStatus: outLinkConfig.showRunningStatus,
    showSkillReferences: outLinkConfig.showSkillReferences,
    showFullText: outLinkConfig.showFullText,
    canDownloadSource: outLinkConfig.canDownloadSource,
    appId,
    uid: appAccess?.tmbId ?? uid
  };
}
