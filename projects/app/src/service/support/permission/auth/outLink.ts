import type { AuthOutLinkChatProps } from '@fastgpt/global/support/outLink/api';
import { type ShareChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { authOutLinkValid } from '@fastgpt/service/support/permission/publish/authLink';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { type OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { authOutLinkInit, authOutLinkLimit } from '@fastgpt/service/support/outLink/runtime/auth';
import { isProVersion } from '@fastgpt/service/common/system/constants';

export const authOutLink = async ({
  shareId,
  outLinkUid
}: ShareChatAuthProps): Promise<{
  uid: string;
  appId: string;
  outLinkConfig: OutLinkSchemaType;
}> => {
  if (!outLinkUid) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }
  const result = await authOutLinkValid({ shareId });

  const { uid } = await authOutLinkInit({
    outLinkUid,
    tokenUrl: result.outLinkConfig.limit?.hookUrl
  });

  return {
    ...result,
    uid
  };
};

/** 校验外链聊天请求并返回后续聊天鉴权所需的发布配置。 */
export async function authOutLinkChatStart({
  shareId,
  outLinkUid,
  question
}: AuthOutLinkChatProps & {
  shareId: string;
}) {
  // get outLink and app
  const { outLinkConfig, appId } = await authOutLinkValid({ shareId });

  // 社区版保持历史行为；商业版校验改为本地执行，不再依赖 Pro HTTP 接口。
  const { uid } = isProVersion()
    ? await authOutLinkLimit({ outLink: outLinkConfig, outLinkUid, question })
    : { uid: outLinkUid };

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
    uid
  };
}
