import { dispatchChatCompletion } from '../moduleDispatch/chat/oneapi';
import { Prompt_AIPolish } from '@/global/core/prompt/agent';
import { ChatDispatchProps } from '@fastgpt/global/core/module/type';
import { ModuleOutputKeyEnum, ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { replaceVariable } from '@fastgpt/global/common/string/tools';

export async function aiPolish({
  res,
  mode,
  teamId,
  tmbId,
  user,
  appId,
  responseChatItemId,
  histories,
  variables,
  polish,
  stream,
  detail,
  userChatInput,
  answerText
}: ChatDispatchProps & {
  [ModuleInputKeyEnum.userChatInput]: string;
  [ModuleOutputKeyEnum.answerText]: string;
}) {
  const polishModel = global.llmModels[0].model;

  userChatInput = replaceVariable(Prompt_AIPolish, {
    text: `${histories.map((item) => `${item.obj}:${item.value}`).join('\n')}
Human: ${userChatInput}`,
    question: answerText
  });

  const { answerText: polishedAnswerText } = await dispatchChatCompletion({
    res,
    stream,
    detail,
    user,
    histories,
    polish,
    params: {
      model: polishModel,
      temperature: 0,
      maxToken: 4000,
      history: 6,
      quoteQA: [],
      userChatInput,
      isResponseAnswerText: true,
      systemPrompt: '',
      quoteTemplate: '',
      quotePrompt: ''
    },
    mode: mode,
    teamId: teamId,
    tmbId: tmbId,
    appId: appId,
    variables: variables,
    outputs: [],
    inputs: []
  });

  return polishedAnswerText;
}
