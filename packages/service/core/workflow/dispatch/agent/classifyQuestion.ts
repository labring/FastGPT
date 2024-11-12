import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { countMessagesTokens } from '../../../../common/string/tiktoken/index';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { createChatCompletion } from '../../../ai/config';
import type { ClassifyQuestionAgentItemType } from '@fastgpt/global/core/workflow/template/system/classifyQuestion/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { Prompt_CQJson } from '@fastgpt/global/core/ai/prompt/agent';
import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { ModelTypeEnum, getLLMModel } from '../../../ai/model';
import { getHistories } from '../utils';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { loadRequestMessages } from '../../../chat/utils';
import { llmCompletionsBodyFormat } from '../../../ai/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.history]?: ChatItemType[] | number;
  [NodeInputKeyEnum.userChatInput]: string;
  [NodeInputKeyEnum.agents]: ClassifyQuestionAgentItemType[];
}>;
type CQResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.cqResult]: string;
}>;
type ActionProps = Props & { cqModel: LLMModelItemType };

/* request openai chat */
export const dispatchClassifyQuestion = async (props: Props): Promise<CQResponse> => {
  const {
    user,
    node: { nodeId, name },
    histories,
    params: { model, history = 6, agents, userChatInput }
  } = props as Props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const cqModel = getLLMModel(model);

  const chatHistories = getHistories(history, histories);

  const { arg, tokens } = await completions({
    ...props,
    histories: chatHistories,
    cqModel
  });

  const result = agents.find((item) => item.key === arg?.type) || agents[agents.length - 1];

  const { totalPoints, modelName } = formatModelChars2Points({
    model: cqModel.model,
    tokens,
    modelType: ModelTypeEnum.llm
  });

  return {
    [NodeOutputKeyEnum.cqResult]: result.value,
    [DispatchNodeResponseKeyEnum.skipHandleId]: agents
      .filter((item) => item.key !== arg?.type)
      .map((item) => getHandleId(nodeId, 'source', item.key)),
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
      model: modelName,
      query: userChatInput,
      tokens,
      cqList: agents,
      cqResult: result.value,
      contextTotalLen: chatHistories.length + 2
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        moduleName: name,
        totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        tokens
      }
    ]
  };
};

const completions = async ({
  cqModel,
  user,
  histories,
  params: { agents, systemPrompt = '', userChatInput }
}: ActionProps) => {
  const messages: ChatItemType[] = [
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: replaceVariable(cqModel.customCQPrompt || Prompt_CQJson, {
              systemPrompt: systemPrompt || 'null',
              typeList: agents
                .map((item) => `{"类型ID":"${item.key}", "问题类型":"${item.value}"}`)
                .join('\n------\n'),
              history: histories
                .map((item) => `${item.obj}:${chatValue2RuntimePrompt(item.value).text}`)
                .join('\n------\n'),
              question: userChatInput
            })
          }
        }
      ]
    }
  ];
  const requestMessages = await loadRequestMessages({
    messages: chats2GPTMessages({ messages, reserveId: false }),
    useVision: false
  });

  const { response: data } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        model: cqModel.model,
        temperature: 0.01,
        messages: requestMessages,
        stream: false
      },
      cqModel
    ),
    userKey: user.openaiAccount
  });
  const answer = data.choices?.[0].message?.content || '';

  // console.log(JSON.stringify(chats2GPTMessages({ messages, reserveId: false }), null, 2));
  // console.log(answer, '----');

  const id =
    agents.find((item) => answer.includes(item.key))?.key ||
    agents.find((item) => answer.includes(item.value))?.key ||
    '';

  return {
    tokens: await countMessagesTokens(messages),
    arg: { type: id }
  };
};
