import { adaptChat2GptMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatContextFilter } from '@fastgpt/service/core/chat/utils';
import type { moduleDispatchResType, ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import type { ClassifyQuestionAgentItemType } from '@fastgpt/global/core/module/type.d';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { Prompt_CQJson } from '@/global/core/prompt/agent';
import { FunctionModelItemType } from '@fastgpt/global/core/ai/model.d';
import { ModelTypeEnum, getCQModel } from '@/service/core/ai/model';
import { getHistories } from '../utils';
import { formatModelPrice2Store } from '@/service/support/wallet/bill/utils';

type Props = ModuleDispatchProps<{
  [ModuleInputKeyEnum.aiModel]: string;
  [ModuleInputKeyEnum.aiSystemPrompt]?: string;
  [ModuleInputKeyEnum.history]?: ChatItemType[] | number;
  [ModuleInputKeyEnum.userChatInput]: string;
  [ModuleInputKeyEnum.agents]: ClassifyQuestionAgentItemType[];
}>;
type CQResponse = {
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
  [key: string]: any;
};

const agentFunName = 'classify_question';

/* request openai chat */
export const dispatchClassifyQuestion = async (props: Props): Promise<CQResponse> => {
  const {
    user,
    histories,
    inputs: { model, history = 6, agents, userChatInput }
  } = props as Props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const cqModel = getCQModel(model);

  const chatHistories = getHistories(history, histories);

  const { arg, inputTokens, outputTokens } = await (async () => {
    if (cqModel.toolChoice) {
      return toolChoice({
        ...props,
        histories: chatHistories,
        cqModel
      });
    }
    return completions({
      ...props,
      histories: chatHistories,
      cqModel
    });
  })();

  const result = agents.find((item) => item.key === arg?.type) || agents[agents.length - 1];

  const { total, modelName } = formatModelPrice2Store({
    model: cqModel.model,
    inputLen: inputTokens,
    outputLen: outputTokens,
    type: ModelTypeEnum.cq
  });

  return {
    [result.key]: true,
    [ModuleOutputKeyEnum.responseData]: {
      price: user.openaiAccount?.key ? 0 : total,
      model: modelName,
      query: userChatInput,
      inputTokens,
      outputTokens,
      cqList: agents,
      cqResult: result.value,
      contextTotalLen: chatHistories.length + 2
    }
  };
};

async function toolChoice({
  user,
  cqModel,
  histories,
  inputs: { agents, systemPrompt, userChatInput }
}: Props & { cqModel: FunctionModelItemType }) {
  const messages: ChatItemType[] = [
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: systemPrompt
        ? `<背景知识>
${systemPrompt}
</背景知识>

问题: "${userChatInput}"
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
    description: '根据对话记录及补充的背景知识，对问题进行分类，并返回对应的类型字段',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: `问题类型。下面是几种可选的问题类型: ${agents
            .map((item) => `${item.value}，返回：'${item.key}'`)
            .join('；')}`,
          enum: agents.map((item) => item.key)
        }
      },
      required: ['type']
    }
  };
  const ai = getAIApi(user.openaiAccount, 480000);

  const response = await ai.chat.completions.create({
    model: cqModel.model,
    temperature: 0,
    messages: [...adaptMessages],
    tools: [
      {
        type: 'function',
        function: agentFunction
      }
    ],
    tool_choice: { type: 'function', function: { name: agentFunName } }
  });

  try {
    const arg = JSON.parse(
      response?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || ''
    );

    return {
      arg,
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0
    };
  } catch (error) {
    console.log(agentFunction.parameters);
    console.log(response.choices?.[0]?.message);

    console.log('Your model may not support toll_call', error);

    return {
      arg: {},
      inputTokens: 0,
      outputTokens: 0
    };
  }
}

async function completions({
  cqModel,
  user,
  histories,
  inputs: { agents, systemPrompt = '', userChatInput }
}: Props & { cqModel: FunctionModelItemType }) {
  const messages: ChatItemType[] = [
    {
      obj: ChatRoleEnum.Human,
      value: replaceVariable(cqModel.functionPrompt || Prompt_CQJson, {
        systemPrompt: systemPrompt || 'null',
        typeList: agents
          .map((item) => `{"questionType": "${item.value}", "typeId": "${item.key}"}`)
          .join('\n'),
        history: histories.map((item) => `${item.obj}:${item.value}`).join('\n'),
        question: userChatInput
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

  const id =
    agents.find((item) => answer.includes(item.key) || answer.includes(item.value))?.key || '';

  return {
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    arg: { type: id }
  };
}
