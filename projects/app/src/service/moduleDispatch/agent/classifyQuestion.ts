import { adaptChat2GptMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatContextFilter } from '@fastgpt/service/core/chat/utils';
import type { moduleDispatchResType, ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import type { ClassifyQuestionAgentItemType } from '@fastgpt/global/core/module/type.d';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { Prompt_CQJson } from '@/global/core/prompt/agent';
import { FunctionModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getCQModel } from '@/service/core/ai/model';

type Props = ModuleDispatchProps<{
  [ModuleInputKeyEnum.aiModel]: string;
  [ModuleInputKeyEnum.aiSystemPrompt]?: string;
  [ModuleInputKeyEnum.history]?: ChatItemType[];
  [ModuleInputKeyEnum.userChatInput]: string;
  [ModuleInputKeyEnum.agents]: ClassifyQuestionAgentItemType[];
}>;
type CQResponse = {
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
  [key: string]: any;
};

const agentFunName = 'agent_user_question';

/* request openai chat */
export const dispatchClassifyQuestion = async (props: Props): Promise<CQResponse> => {
  const {
    user,
    inputs: { model, agents, userChatInput }
  } = props as Props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const cqModel = getCQModel(model);

  const { arg, tokens } = await (async () => {
    if (cqModel.functionCall) {
      return functionCall({
        ...props,
        cqModel
      });
    }
    return completions({
      ...props,
      cqModel
    });
  })();

  const result = agents.find((item) => item.key === arg?.type) || agents[agents.length - 1];

  return {
    [result.key]: 1,
    [ModuleOutputKeyEnum.responseData]: {
      price: user.openaiAccount?.key ? 0 : cqModel.price * tokens,
      model: cqModel.name || '',
      query: userChatInput,
      tokens,
      cqList: agents,
      cqResult: result.value
    }
  };
};

async function functionCall({
  user,
  cqModel,
  inputs: { agents, systemPrompt, history = [], userChatInput }
}: Props & { cqModel: FunctionModelItemType }) {
  const messages: ChatItemType[] = [
    ...history,
    {
      obj: ChatRoleEnum.Human,
      value: systemPrompt
        ? `补充的背景知识:
"""
${systemPrompt}
"""
我的问题: ${userChatInput}
      `
        : userChatInput
    }
  ];

  const filterMessages = ChatContextFilter({
    messages,
    maxTokens: cqModel.maxContext
  });
  const adaptMessages = adaptChat2GptMessages({ messages: filterMessages, reserveId: false });

  // function body
  const agentFunction = {
    name: agentFunName,
    description: '请根据对话记录及补充的背景知识，判断用户的问题类型，并返回对应的字段',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: `判断用户的问题类型，并返回对应的字段。下面是几种问题类型: ${agents
            .map((item) => `${item.value}，返回：'${item.key}'`)
            .join('；')}`,
          enum: agents.map((item) => item.key)
        }
      }
    }
  };
  const ai = getAIApi(user.openaiAccount, 48000);

  const response = await ai.chat.completions.create({
    model: cqModel.model,
    temperature: 0,
    messages: [...adaptMessages],
    function_call: { name: agentFunName },
    functions: [agentFunction]
  });

  try {
    const arg = JSON.parse(response.choices?.[0]?.message?.function_call?.arguments || '');

    return {
      arg,
      tokens: response.usage?.total_tokens || 0
    };
  } catch (error) {
    console.log(agentFunction.parameters);
    console.log(response.choices?.[0]?.message);

    console.log('Your model may not support function_call', error);

    return {
      arg: {},
      tokens: 0
    };
  }
}

async function completions({
  cqModel,
  user,
  inputs: { agents, systemPrompt = '', history = [], userChatInput }
}: Props & { cqModel: FunctionModelItemType }) {
  const messages: ChatItemType[] = [
    {
      obj: ChatRoleEnum.Human,
      value: replaceVariable(cqModel.functionPrompt || Prompt_CQJson, {
        systemPrompt,
        typeList: agents.map((item) => `ID: "${item.key}", 问题类型:${item.value}`).join('\n'),
        text: `${history.map((item) => `${item.obj}:${item.value}`).join('\n')}
Human:${userChatInput}`
      })
    }
  ];

  const ai = getAIApi(user.openaiAccount, 480000);

  const data = await ai.chat.completions.create({
    model: cqModel.model,
    temperature: 0.01,
    messages: adaptChat2GptMessages({ messages, reserveId: false }),
    stream: false
  });
  const answer = data.choices?.[0].message?.content || '';
  const totalTokens = data.usage?.total_tokens || 0;

  const id = agents.find((item) => answer.includes(item.key))?.key || '';

  return {
    tokens: totalTokens,
    arg: { type: id }
  };
}
