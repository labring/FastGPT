import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { ChatContextFilter } from '@/service/utils/chat/index';
import type { ChatHistoryItemResType, ChatItemType } from '@/types/chat';
import { ChatModuleEnum, ChatRoleEnum, TaskResponseKeyEnum } from '@/constants/chat';
import { getOpenAIApi, axiosConfig } from '@/service/ai/openai';
import type { ClassifyQuestionAgentItemType } from '@/types/app';
import { countModelPrice } from '@/service/events/pushBill';

export type CQProps = {
  systemPrompt?: string;
  history?: ChatItemType[];
  userChatInput: string;
  agents: ClassifyQuestionAgentItemType[];
};
export type CQResponse = {
  [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType;
  [key: string]: any;
};

const agentModel = 'gpt-3.5-turbo';
const agentFunName = 'agent_user_question';
const maxTokens = 2000;

/* request openai chat */
export const dispatchClassifyQuestion = async (props: Record<string, any>): Promise<CQResponse> => {
  const { agents, systemPrompt, history = [], userChatInput } = props as CQProps;

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
    model: agentModel,
    prompts: messages,
    maxTokens
  });
  const adaptMessages = adaptChatItem_openAI({ messages: filterMessages, reserveId: false });

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
  const chatAPI = getOpenAIApi();

  const response = await chatAPI.createChatCompletion(
    {
      model: agentModel,
      temperature: 0,
      messages: [...adaptMessages],
      function_call: { name: agentFunName },
      functions: [agentFunction]
    },
    {
      ...axiosConfig()
    }
  );

  const arg = JSON.parse(response.data.choices?.[0]?.message?.function_call?.arguments || '');

  const tokens = response.data.usage?.total_tokens || 0;

  const result = agents.find((item) => item.key === arg?.type) || agents[0];

  return {
    [result.key]: 1,
    [TaskResponseKeyEnum.responseData]: {
      moduleName: ChatModuleEnum.CQ,
      price: countModelPrice({ model: agentModel, tokens }),
      model: agentModel,
      tokens,
      cqList: agents,
      cqResult: result.value
    }
  };
};
