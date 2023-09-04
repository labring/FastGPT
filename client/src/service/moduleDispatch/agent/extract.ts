import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { ChatContextFilter } from '@/service/utils/chat/index';
import type { ChatHistoryItemResType, ChatItemType } from '@/types/chat';
import { ChatModuleEnum, ChatRoleEnum, TaskResponseKeyEnum } from '@/constants/chat';
import { getAIChatApi, axiosConfig } from '@/service/lib/openai';
import type { ContextExtractAgentItemType } from '@/types/app';
import { ContextExtractEnum } from '@/constants/flow/flowField';
import { countModelPrice } from '@/service/events/pushBill';
import { UserModelSchema } from '@/types/mongoSchema';
import { getModel } from '@/service/utils/data';

export type Props = {
  userOpenaiAccount: UserModelSchema['openaiAccount'];
  history?: ChatItemType[];
  [ContextExtractEnum.content]: string;
  [ContextExtractEnum.extractKeys]: ContextExtractAgentItemType[];
  [ContextExtractEnum.description]: string;
};
export type Response = {
  [ContextExtractEnum.success]?: boolean;
  [ContextExtractEnum.failed]?: boolean;
  [ContextExtractEnum.fields]: string;
  [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType;
};

const agentModel = 'gpt-3.5-turbo';
const agentFunName = 'agent_extract_data';
const maxTokens = 4000;

export async function dispatchContentExtract({
  userOpenaiAccount,
  content,
  extractKeys,
  history = [],
  description
}: Props): Promise<Response> {
  if (!content) {
    return Promise.reject('Input is empty');
  }
  const messages: ChatItemType[] = [
    ...history,
    {
      obj: ChatRoleEnum.Human,
      value: content
    }
  ];
  const filterMessages = ChatContextFilter({
    // @ts-ignore
    model: agentModel,
    prompts: messages,
    maxTokens
  });
  const adaptMessages = adaptChatItem_openAI({ messages: filterMessages, reserveId: false });

  const properties: Record<
    string,
    {
      type: string;
      description: string;
    }
  > = {};
  extractKeys.forEach((item) => {
    properties[item.key] = {
      type: 'string',
      description: item.desc
    };
  });

  // function body
  const agentFunction = {
    name: agentFunName,
    description: `${description}\n如果内容不存在，返回空字符串。`,
    parameters: {
      type: 'object',
      properties,
      required: extractKeys.filter((item) => item.required).map((item) => item.key)
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

  const arg: Record<string, any> = (() => {
    try {
      return JSON.parse(response.data.choices?.[0]?.message?.function_call?.arguments || '{}');
    } catch (error) {
      return {};
    }
  })();

  // auth fields
  let success = !extractKeys.find((item) => !arg[item.key]);
  // auth empty value
  if (success) {
    for (const key in arg) {
      if (arg[key] === '') {
        success = false;
        break;
      }
    }
  }

  const tokens = response.data.usage?.total_tokens || 0;

  return {
    [ContextExtractEnum.success]: success ? true : undefined,
    [ContextExtractEnum.failed]: success ? undefined : true,
    [ContextExtractEnum.fields]: JSON.stringify(arg),
    ...arg,
    [TaskResponseKeyEnum.responseData]: {
      moduleName: ChatModuleEnum.Extract,
      price: userOpenaiAccount?.key ? 0 : countModelPrice({ model: agentModel, tokens }),
      model: getModel(agentModel)?.name || agentModel,
      tokens,
      extractDescription: description,
      extractResult: arg
    }
  };
}
