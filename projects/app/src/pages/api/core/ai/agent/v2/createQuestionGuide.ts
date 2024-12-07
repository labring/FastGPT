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
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

export const SYSTEM_PROMPT_QUESTION_GUIDE = `请严格遵循格式规则：以 JSON 格式返回题目：["问题1"，"问题2"，"问题3"]。`;

export type CreateQuestionGuideParams = OutLinkChatAuthProps & {
  appId: string;
  chatId: string;
};

async function handler(req: ApiRequestProps<CreateQuestionGuideParams>, res: NextApiResponse<any>) {
  const { appId, chatId } = req.body;
  const [{ tmbId, teamId }] = await Promise.all([
    authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      ...req.body
    })
  ]);

  // Auth app and get questionGuide config
  const { app } = await authApp({ appId, req, per: ReadPermissionVal, authToken: true });
  const chatConfig = app.chatConfig;
  const questionGuide = chatConfig.questionGuide;

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

  const customPromptWithFixed = questionGuide?.customPrompt
    ? questionGuide.customPrompt + '\n' + SYSTEM_PROMPT_QUESTION_GUIDE
    : undefined;

  const { result, tokens } = await createQuestionGuide({
    messages,
    model: qgModel,
    customPrompt: customPromptWithFixed
  });

  jsonRes(res, {
    data: result
  });

  pushQuestionGuideUsage({
    tokens,
    teamId,
    tmbId
  });
}

export default NextAPI(handler);
