import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ClassifyQuestionAgentItemType } from '@fastgpt/global/core/workflow/template/system/classifyQuestion/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { getCQSystemPrompt } from '@fastgpt/global/core/ai/prompt/agent';
import { type LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getLLMModel } from '../../../ai/model';
import { getHistories } from '../utils';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { addLog } from '../../../../common/system/log';
import { ModelTypeEnum } from '../../../../../global/core/ai/model';
import { createLLMResponse } from '../../../ai/llm/request';

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
type ActionProps = Props & {
  cqModel: LLMModelItemType;
  lastMemory?: ClassifyQuestionAgentItemType;
};

/* request openai chat */
export const dispatchClassifyQuestion = async (props: Props): Promise<CQResponse> => {
  const {
    externalProvider,
    runningAppInfo,
    node: { nodeId, name },
    histories,
    params: { model, history = 6, agents, userChatInput }
  } = props as Props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const cqModel = getLLMModel(model);

  const memoryKey = `${runningAppInfo.id}-${nodeId}`;
  const chatHistories = getHistories(history, histories);
  // @ts-ignore
  const lastMemory = chatHistories[chatHistories.length - 1]?.memories?.[
    memoryKey
  ] as ClassifyQuestionAgentItemType;

  const { arg, inputTokens, outputTokens } = await completions({
    ...props,
    lastMemory,
    histories: chatHistories,
    cqModel
  });

  const result = agents.find((item) => item.key === arg?.type) || agents[agents.length - 1];

  const { totalPoints, modelName } = formatModelChars2Points({
    model: cqModel.model,
    inputTokens: inputTokens,
    outputTokens: outputTokens
  });

  return {
    data: {
      [NodeOutputKeyEnum.cqResult]: result.value
    },
    [DispatchNodeResponseKeyEnum.skipHandleId]: agents
      .filter((item) => item.key !== result.key)
      .map((item) => getHandleId(nodeId, 'source', item.key)),
    [DispatchNodeResponseKeyEnum.memories]: {
      [memoryKey]: result
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: externalProvider.openaiAccount?.key ? 0 : totalPoints,
      model: modelName,
      query: userChatInput,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      cqList: agents,
      cqResult: result.value,
      contextTotalLen: chatHistories.length + 2
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        moduleName: name,
        totalPoints: externalProvider.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        inputTokens: inputTokens,
        outputTokens: outputTokens
      }
    ]
  };
};

const completions = async ({
  cqModel,
  externalProvider,
  histories,
  lastMemory,
  params: { agents, systemPrompt = '', userChatInput }
}: ActionProps) => {
  const messages: ChatItemType[] = [
    {
      obj: ChatRoleEnum.System,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: getCQSystemPrompt({
              systemPrompt,
              memory: lastMemory ? JSON.stringify(lastMemory) : '',
              typeList: JSON.stringify(
                agents.map((item) => ({ id: item.key, description: item.value }))
              )
            })
          }
        }
      ]
    },
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: userChatInput
          }
        }
      ]
    }
  ];

  const {
    answerText: answer,
    usage: { inputTokens, outputTokens }
  } = await createLLMResponse({
    body: {
      model: cqModel.model,
      temperature: 0.01,
      messages: chats2GPTMessages({ messages, reserveId: false }),
      stream: true
    },
    userKey: externalProvider.openaiAccount
  });

  // console.log(JSON.stringify(chats2GPTMessages({ messages, reserveId: false }), null, 2));

  const id =
    agents.find((item) => answer.includes(item.key))?.key ||
    agents.find((item) => answer.includes(item.value))?.key ||
    '';

  if (!id) {
    addLog.warn('Classify error', { answer });
  }

  return {
    inputTokens,
    outputTokens,
    arg: { type: id }
  };
};
