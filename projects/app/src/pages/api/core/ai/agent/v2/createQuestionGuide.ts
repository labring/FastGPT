import type { NextApiResponse } from 'next';
import { pushQuestionGuideUsage } from '@/service/support/wallet/usage/push';
import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { getDefaultLLMModel } from '@fastgpt/service/core/ai/model';
import {
  CreateQuestionGuideResponseSchema,
  CreateQuestionGuideV2BodySchema,
  type CreateQuestionGuideResponseType,
  type CreateQuestionGuideV2BodyType
} from '@fastgpt/global/openapi/core/ai/agent/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import type { AppQGConfigType } from '@fastgpt/global/core/app/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

async function handler(
  req: ApiRequestProps<CreateQuestionGuideV2BodyType>,
  _res: NextApiResponse<any>
): Promise<CreateQuestionGuideResponseType> {
  const {
    sourceType,
    sourceId,
    chatId,
    questionGuide: inputQuestionGuide,
    outLinkAuthData
  } = parseApiInput({
    req,
    bodySchema: CreateQuestionGuideV2BodySchema
  }).body;

  const {
    tmbId,
    teamId,
    sourceType: resolvedSourceType,
    sourceId: resolvedSourceId
  } = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });

  // Auth app and get questionGuide config
  const questionGuide: AppQGConfigType | undefined = await (async () => {
    if (inputQuestionGuide) {
      return inputQuestionGuide;
    }
    if (resolvedSourceType !== ChatSourceTypeEnum.app) {
      return undefined;
    }
    const { chatConfig } = await getAppLatestVersion(resolvedSourceId);
    return chatConfig.questionGuide;
  })();

  // Get histories
  const { histories } = await getChatItems({
    sourceType: resolvedSourceType,
    sourceId: resolvedSourceId,
    chatId,
    offset: 0,
    limit: 6,
    field: 'obj value time'
  });
  const messages = chats2GPTMessages({ messages: histories, reserveId: false });

  const qgModel = questionGuide?.model || getDefaultLLMModel().model;

  const { result, inputTokens, outputTokens } = await createQuestionGuide({
    messages,
    model: qgModel,
    customPrompt: questionGuide?.customPrompt,
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
