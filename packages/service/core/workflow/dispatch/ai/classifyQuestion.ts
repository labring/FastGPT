import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import {
  countGptMessagesTokens,
  countPromptTokens
} from '../../../../common/string/tiktoken/index';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { createChatCompletion } from '../../../ai/config';
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
import { loadRequestMessages } from '../../../chat/utils';
import { llmCompletionsBodyFormat, formatLLMResponse } from '../../../ai/utils';
import { addLog } from '../../../../common/system/log';
import { ModelTypeEnum } from '../../../../../global/core/ai/model';

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
    outputTokens: outputTokens,
    modelType: ModelTypeEnum.llm
  });

  return {
    [NodeOutputKeyEnum.cqResult]: result.value,
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
  const requestMessages = await loadRequestMessages({
    messages: chats2GPTMessages({ messages, reserveId: false }),
    useVision: false
  });

  const { response } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        model: cqModel.model,
        temperature: 0.01,
        messages: requestMessages,
        stream: true
      },
      cqModel
    ),
    userKey: externalProvider.openaiAccount
  });
  const { text: answer, usage } = await formatLLMResponse(response);

  // console.log(JSON.stringify(chats2GPTMessages({ messages, reserveId: false }), null, 2));

  const id =
    agents.find((item) => answer.includes(item.key))?.key ||
    agents.find((item) => answer.includes(item.value))?.key ||
    '';

  if (!id) {
    addLog.warn('Classify error', { answer });
  }

  return {
    inputTokens: usage?.prompt_tokens || (await countGptMessagesTokens(requestMessages)),
    outputTokens: usage?.completion_tokens || (await countPromptTokens(answer)),
    arg: { type: id }
  };
};
