import { adaptChat2GptMessages } from '@/utils/common/adapt/message';
import { ChatContextFilter } from '@/service/common/tiktoken';
import type { ChatHistoryItemResType, ChatItemType } from '@/types/chat';
import { ChatRoleEnum, TaskResponseKeyEnum } from '@/constants/chat';
import { getAIChatApi, axiosConfig } from '@/service/lib/openai';
import type { ClassifyQuestionAgentItemType } from '@/types/app';
import { countModelPrice } from '@/service/events/pushBill';
import { getModel } from '@/service/utils/data';
import { SystemInputEnum } from '@/constants/app';
import { SpecialInputKeyEnum } from '@/constants/flow';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { ModuleDispatchProps } from '@/types/core/modules';

export type CQProps = ModuleDispatchProps<{
  systemPrompt?: string;
  history?: ChatItemType[];
  [SystemInputEnum.userChatInput]: string;
  [SpecialInputKeyEnum.agents]: ClassifyQuestionAgentItemType[];
}>;
export type CQResponse = {
  [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType;
  [key: string]: any;
};

const agentModel = 'gpt-3.5-turbo';
const agentFunName = 'agent_user_question';
const maxTokens = 3000;

/* request openai chat */
export const dispatchClassifyQuestion = async (props: Record<string, any>): Promise<CQResponse> => {
  const {
    moduleName,
    userOpenaiAccount,
    inputs: { agents, systemPrompt, history = [], userChatInput }
  } = props as CQProps;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const messages: ChatItemType[] = [
    ...(systemPrompt
      ? [
          {
            obj: ChatRoleEnum.System,
            value: systemPrompt
          }
        ]
      : []),
    ...history,
    {
      obj: ChatRoleEnum.Human,
      value: userChatInput
    }
  ];
  const filterMessages = ChatContextFilter({
    messages,
    maxTokens
  });
  const adaptMessages = adaptChat2GptMessages({ messages: filterMessages, reserveId: false });

  //   function body
  const agentFunction = {
    name: agentFunName,
    description: '判断用户问题的类型属于哪方面，返回对应的枚举字段',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: agents.map((item) => `${item.value}，返回：'${item.key}'`).join('；'),
          enum: agents.map((item) => item.key)
        }
      },
      required: ['type']
    }
  };
  const chatAPI = getAIChatApi(userOpenaiAccount);

  const response = await chatAPI.createChatCompletion(
    {
      model: agentModel,
      temperature: 0,
      messages: [...adaptMessages],
      function_call: { name: agentFunName },
      functions: [agentFunction]
    },
    {
      ...axiosConfig(userOpenaiAccount)
    }
  );

  const arg = JSON.parse(response.data.choices?.[0]?.message?.function_call?.arguments || '');

  const tokens = response.data.usage?.total_tokens || 0;

  const result = agents.find((item) => item.key === arg?.type) || agents[0];

  return {
    [result.key]: 1,
    [TaskResponseKeyEnum.responseData]: {
      moduleType: FlowModuleTypeEnum.classifyQuestion,
      moduleName,
      price: userOpenaiAccount?.key ? 0 : countModelPrice({ model: agentModel, tokens }),
      model: getModel(agentModel)?.name || agentModel,
      tokens,
      cqList: agents,
      cqResult: result.value
    }
  };
};
