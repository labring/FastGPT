import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { pushQuestionGuideUsage } from '@/service/support/wallet/usage/push';
import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';

export type CreateQuestionGuideParams = OutLinkChatAuthProps & {
  appId: string;
  chatId: string;
  questionGuide?: {
    open: boolean;
    model?: string;
    customPrompt?: string;
  };
};

async function handler(req: ApiRequestProps<CreateQuestionGuideParams>, res: NextApiResponse<any>) {
  const { appId, chatId, questionGuide: inputQuestionGuide } = req.body;
  const [{ tmbId, teamId }] = await Promise.all([
    authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      ...req.body
    })
  ]);

  // Auth app and get questionGuide config
  const questionGuide = await (async () => {
    if (inputQuestionGuide) {
      return inputQuestionGuide;
    }
    const { chatConfig } = await getAppLatestVersion(appId);
    return chatConfig.questionGuide;
  })();

  // Get histories
  const { histories } = await getChatItems({
    appId,
    chatId,
    offset: 0,
    limit: 6,
    field: 'obj value time'
  });
  const messages = chats2GPTMessages({ messages: histories, reserveId: false });

  const qgModel = questionGuide?.model || global.llmModels[0].model;

  const { result, inputTokens, outputTokens } = await createQuestionGuide({
    messages,
    model: qgModel,
    customPrompt: questionGuide?.customPrompt
  });

  pushQuestionGuideUsage({
    inputTokens,
    outputTokens,
    teamId,
    tmbId
  });

  return result;
}

export default NextAPI(handler);
