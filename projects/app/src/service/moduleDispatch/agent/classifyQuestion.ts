import { adaptChat2GptMessages } from '@/utils/common/adapt/message';
import { ChatContextFilter } from '@/service/common/tiktoken';
import type { ChatHistoryItemResType, ChatItemType } from '@/types/chat';
import { ChatRoleEnum, TaskResponseKeyEnum } from '@/constants/chat';
import { getAIChatApi, axiosConfig } from '@fastgpt/core/aiApi/config';
import type { ClassifyQuestionAgentItemType } from '@/types/app';
import { SystemInputEnum } from '@/constants/app';
import { SpecialInputKeyEnum } from '@/constants/flow';
import { FlowModuleTypeEnum } from '@/constants/flow';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { replaceVariable } from '@/utils/common/tools/text';
import { Prompt_CQJson } from '@/prompts/core/agent';
import { defaultCQModel } from '@/pages/api/system/getInitData';

type Props = ModuleDispatchProps<{
  systemPrompt?: string;
  history?: ChatItemType[];
  [SystemInputEnum.userChatInput]: string;
  [SpecialInputKeyEnum.agents]: ClassifyQuestionAgentItemType[];
}>;
type CQResponse = {
  [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType;
  [key: string]: any;
};

const agentFunName = 'agent_user_question';

/* request openai chat */
export const dispatchClassifyQuestion = async (props: Props): Promise<CQResponse> => {
  const {
    moduleName,
    userOpenaiAccount,
    inputs: { agents, userChatInput }
  } = props as Props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const cqModel = global.cqModel || defaultCQModel;

  const { arg, tokens } = await (async () => {
    if (cqModel.functionCall) {
      return functionCall(props);
    }
    return completions(props);
  })();

  const result = agents.find((item) => item.key === arg?.type) || agents[agents.length - 1];

  return {
    [result.key]: 1,
    [TaskResponseKeyEnum.responseData]: {
      moduleType: FlowModuleTypeEnum.classifyQuestion,
      moduleName,
      price: userOpenaiAccount?.key ? 0 : cqModel.price * tokens,
      model: cqModel.name || '',
      tokens,
      cqList: agents,
      cqResult: result.value
    }
  };
};

async function functionCall({
  userOpenaiAccount,
  inputs: { agents, systemPrompt, history = [], userChatInput }
}: Props) {
  const cqModel = global.cqModel;

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
    maxTokens: cqModel.maxToken
  });
  const adaptMessages = adaptChat2GptMessages({ messages: filterMessages, reserveId: false });

  //   function body
  const agentFunction = {
    name: agentFunName,
    description: '判断用户问题的类型属于哪方面，返回对应的字段',
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
      model: cqModel.model,
      temperature: 0,
      messages: [...adaptMessages],
      function_call: { name: agentFunName },
      functions: [agentFunction]
    },
    {
      ...axiosConfig(userOpenaiAccount)
    }
  );

  try {
    const arg = JSON.parse(response.data.choices?.[0]?.message?.function_call?.arguments || '');

    return {
      arg,
      tokens: response.data.usage?.total_tokens || 0
    };
  } catch (error) {
    console.log('Your model may not support function_call');

    return {
      arg: {},
      tokens: 0
    };
  }
}

async function completions({
  userOpenaiAccount,
  inputs: { agents, systemPrompt = '', history = [], userChatInput }
}: Props) {
  const extractModel = global.extractModel;

  const messages: ChatItemType[] = [
    {
      obj: ChatRoleEnum.Human,
      value: replaceVariable(extractModel.prompt || Prompt_CQJson, {
        systemPrompt,
        typeList: agents.map((item) => `ID: "${item.key}", 问题类型:${item.value}`).join('\n'),
        text: `${history.map((item) => `${item.obj}:${item.value}`).join('\n')}
Human:${userChatInput}`
      })
    }
  ];

  const chatAPI = getAIChatApi(userOpenaiAccount);

  const { data } = await chatAPI.createChatCompletion(
    {
      model: extractModel.model,
      temperature: 0.01,
      messages: adaptChat2GptMessages({ messages, reserveId: false }),
      stream: false
    },
    {
      timeout: 480000,
      ...axiosConfig(userOpenaiAccount)
    }
  );
  const answer = data.choices?.[0].message?.content || '';
  const totalTokens = data.usage?.total_tokens || 0;

  const id = agents.find((item) => answer.includes(item.key))?.key || '';

  return {
    tokens: totalTokens,
    arg: { type: id }
  };
}
