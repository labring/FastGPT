import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { pushQuestionGuideUsage } from '@/service/support/wallet/usage/push';
import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { authOutLinkValid } from '@fastgpt/service/support/permission/publish/authLink';
import { authOutLinkInit } from '@/service/support/permission/auth/outLink';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

async function handler(
  req: ApiRequestProps<
    OutLinkChatAuthProps & {
      messages: ChatCompletionMessageParam[];
    }
  >,
  res: NextApiResponse<any>
) {
  try {
    await connectToDatabase();
    const { messages } = req.body;

    const { tmbId, teamId } = await authChatCert({
      req,
      authToken: true,
      authApiKey: true
    });

    const qgModel = global.llmModels[0];

    const { result, tokens } = await createQuestionGuide({
      messages,
      model: qgModel.model
    });

    jsonRes(res, {
      data: result
    });

    pushQuestionGuideUsage({
      tokens,
      teamId,
      tmbId
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export default NextAPI(handler);

/* 
  Abandoned
  Different chat source
  1. token (header)
  2. apikey (header)
  3. share page (body: shareId outLinkUid)
  4. team chat page (body: teamId teamToken)
*/
async function authChatCert(props: AuthModeType): Promise<{
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
    const { outLinkConfig } = await authOutLinkValid({ shareId });
    const { uid } = await authOutLinkInit({
      outLinkUid,
      tokenUrl: outLinkConfig.limit?.hookUrl
    });

    return {
      teamId: String(outLinkConfig.teamId),
      tmbId: String(outLinkConfig.tmbId),
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
