import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import type { NextApiResponse } from 'next';

import { NextAPI } from '@/service/middleware/entry';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { pushQuestionGuideUsage } from '@/service/support/wallet/usage/push';
import { type ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import {
  CreateQuestionGuideBodySchema,
  CreateQuestionGuideResponseSchema,
  type CreateQuestionGuideResponseType
} from '@fastgpt/global/openapi/core/ai/agent/api';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { type AuthModeType } from '@fastgpt/service/support/permission/type';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<CreateQuestionGuideResponseType> {
  const { messages } = parseApiInput({ req, bodySchema: CreateQuestionGuideBodySchema }).body;

  const { tmbId, teamId } = await authChatCert({
    req,
    authToken: true,
    authApiKey: true
  });
  const modelHandle = await getTeamModelHandle({ teamId });
  const qgModel = modelHandle.getDefaultModelData('llm');

  const { result, inputTokens, outputTokens } = await createQuestionGuide({
    messages: messages as ChatCompletionMessageParam[],
    model: qgModel,
    teamId
  });

  pushQuestionGuideUsage({
    model: qgModel,
    inputTokens,
    outputTokens,
    teamId,
    tmbId
  });

  return CreateQuestionGuideResponseSchema.parse(result);
}

export default NextAPI(handler);

/*
  Abandoned
  Different chat source
  1. token (header)
  2. apikey (header)
  3. share page (body: outLinkAuthData)
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
  const { shareId, outLinkUid } =
    ((props.req as ApiRequestProps).body as { outLinkAuthData?: OutLinkChatAuthProps })
      .outLinkAuthData || {};

  if (shareId && outLinkUid) {
    const { outLinkConfig, uid } = await authOutLink({ shareId, outLinkUid, req: props.req });

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
  return authCert(props);
}
