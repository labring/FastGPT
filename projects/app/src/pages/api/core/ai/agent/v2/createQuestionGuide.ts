import { NextAPI } from '@/service/middleware/entry';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { pushQuestionGuideUsage } from '@/service/support/wallet/usage/push';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import type { NextApiResponse } from 'next';

import type { AppQGConfigType } from '@fastgpt/global/core/app/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  CreateQuestionGuideResponseSchema,
  CreateQuestionGuideV2BodySchema,
  type CreateQuestionGuideResponseType,
  type CreateQuestionGuideV2BodyType
} from '@fastgpt/global/openapi/core/ai/agent/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authTargetModelResource } from '@fastgpt/service/support/permission/app/resource';

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
    isRoot,
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

  const appWorkflow =
    resolvedSourceType === ChatSourceTypeEnum.app
      ? await getAppLatestVersion(resolvedSourceId)
      : undefined;
  // 未由客户端覆盖时读取持久化配置；该分支在迁移期兼容历史 model 字段。
  const persistedQuestionGuide: AppQGConfigType | undefined = inputQuestionGuide
    ? undefined
    : appWorkflow?.chatConfig.questionGuide;
  const questionGuide = inputQuestionGuide ?? persistedQuestionGuide;

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
  const modelHandle = await getTeamModelHandle({ teamId });
  const qgModelData = (() => {
    if (inputQuestionGuide?.modelId !== undefined || inputQuestionGuide?.model !== undefined) {
      return modelHandle.getLLMModelData({
        modelId: inputQuestionGuide.modelId,
        model: inputQuestionGuide.model
      });
    }
    if (
      persistedQuestionGuide?.modelId !== undefined ||
      persistedQuestionGuide?.model !== undefined
    ) {
      return modelHandle.getLLMModelData({
        modelId: persistedQuestionGuide.modelId,
        model: persistedQuestionGuide.model
      });
    }
    return modelHandle.getDefaultModelData('llm');
  })();
  await authTargetModelResource({
    targetType: resolvedSourceType,
    targetId: resolvedSourceId,
    modelId: qgModelData.modelId,
    teamId,
    tmbId,
    isRoot,
    handle: modelHandle,
    resources: appWorkflow?.resources
  });

  const { result, inputTokens, outputTokens } = await createQuestionGuide({
    messages,
    model: qgModelData,
    customPrompt: questionGuide?.customPrompt,
    teamId
  });

  pushQuestionGuideUsage({
    model: qgModelData,
    inputTokens,
    outputTokens,
    teamId,
    tmbId
  });

  return CreateQuestionGuideResponseSchema.parse(result);
}

export default NextAPI(handler);
