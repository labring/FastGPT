import { adaptChat2GptMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatContextFilter } from '@fastgpt/service/core/chat/utils';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { countMessagesTokens } from '@fastgpt/global/common/string/tiktoken';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import type {
  ContextExtractAgentItemType,
  ModuleDispatchResponse
} from '@fastgpt/global/core/module/type';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { Prompt_ExtractJson } from '@/global/core/prompt/agent';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getHistories } from '../utils';
import { ModelTypeEnum, getLLMModel } from '@fastgpt/service/core/ai/model';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import json5 from 'json5';

type Props = ModuleDispatchProps<{
  [ModuleInputKeyEnum.history]?: ChatItemType[];
  [ModuleInputKeyEnum.contextExtractInput]: string;
  [ModuleInputKeyEnum.extractKeys]: ContextExtractAgentItemType[];
  [ModuleInputKeyEnum.description]: string;
  [ModuleInputKeyEnum.aiModel]: string;
}>;
type Response = ModuleDispatchResponse<{
  [ModuleOutputKeyEnum.success]?: boolean;
  [ModuleOutputKeyEnum.failed]?: boolean;
  [ModuleOutputKeyEnum.contextExtractFields]: string;
}>;

const agentFunName = 'extract_json_data';

export async function dispatchContentExtract(props: Props): Promise<Response> {
  const {
    user,
    module: { name },
    histories,
    params: { content, history = 6, model, description, extractKeys }
  } = props;

  if (!content) {
    return Promise.reject('Input is empty');
  }

  const extractModel = getLLMModel(model);
  const chatHistories = getHistories(history, histories);

  const { arg, tokens } = await (async () => {
    if (extractModel.toolChoice) {
      return toolChoice({
        ...props,
        histories: chatHistories,
        extractModel
      });
    }
    return completions({
      ...props,
      histories: chatHistories,
      extractModel
    });
  })();

  // remove invalid key
  for (let key in arg) {
    const item = extractKeys.find((item) => item.key === key);
    if (!item) {
      delete arg[key];
    }
    if (arg[key] === '') {
      delete arg[key];
    }
  }

  // auto fill required fields
  extractKeys.forEach((item) => {
    if (item.required && !arg[item.key]) {
      arg[item.key] = item.defaultValue || '';
    }
  });

  // auth fields
  let success = !extractKeys.find((item) => !(item.key in arg));
  // auth empty value
  if (success) {
    for (const key in arg) {
      const item = extractKeys.find((item) => item.key === key);
      if (!item) {
        success = false;
        break;
      }
    }
  }

  const { totalPoints, modelName } = formatModelChars2Points({
    model: extractModel.model,
    tokens,
    modelType: ModelTypeEnum.llm
  });

  return {
    [ModuleOutputKeyEnum.success]: success ? true : undefined,
    [ModuleOutputKeyEnum.failed]: success ? undefined : true,
    [ModuleOutputKeyEnum.contextExtractFields]: JSON.stringify(arg),
    ...arg,
    [ModuleOutputKeyEnum.responseData]: {
      totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
      model: modelName,
      query: content,
      tokens,
      extractDescription: description,
      extractResult: arg,
      contextTotalLen: chatHistories.length + 2
    },
    [ModuleOutputKeyEnum.moduleDispatchBills]: [
      {
        moduleName: name,
        totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        tokens
      }
    ]
  };
}

async function toolChoice({
  extractModel,
  user,
  histories,
  params: { content, extractKeys, description }
}: Props & { extractModel: LLMModelItemType }) {
  const messages: ChatItemType[] = [
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: `你的任务是根据上下文获取适当的 JSON 字符串。要求：
"""
- 字符串不要换行。
- 结合上下文和当前问题进行获取。
"""

当前问题: "${content}"`
    }
  ];
  const filterMessages = ChatContextFilter({
    messages,
    maxTokens: extractModel.maxContext
  });
  const adaptMessages = adaptChat2GptMessages({ messages: filterMessages, reserveId: false });

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
      description: item.desc,
      ...(item.enum ? { enum: item.enum.split('\n') } : {})
    };
  });

  // function body
  const agentFunction = {
    name: agentFunName,
    description,
    parameters: {
      type: 'object',
      properties
    }
  };
  const tools: any = [
    {
      type: 'function',
      function: agentFunction
    }
  ];

  const ai = getAIApi({
    userKey: user.openaiAccount,
    timeout: 480000
  });

  const response = await ai.chat.completions.create({
    model: extractModel.model,
    temperature: 0,
    messages: [...adaptMessages],
    tools,
    tool_choice: { type: 'function', function: { name: agentFunName } }
  });

  const arg: Record<string, any> = (() => {
    try {
      return json5.parse(
        response?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}'
      );
    } catch (error) {
      console.log(agentFunction.parameters);
      console.log(response.choices?.[0]?.message?.tool_calls?.[0]?.function);
      console.log('Your model may not support tool_call', error);
      return {};
    }
  })();

  return {
    rawResponse: response?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '',
    tokens: countMessagesTokens(messages, tools),
    arg
  };
}

async function completions({
  extractModel,
  user,
  histories,
  params: { content, extractKeys, description }
}: Props & { extractModel: LLMModelItemType }) {
  const messages: ChatItemType[] = [
    {
      obj: ChatRoleEnum.Human,
      value: replaceVariable(extractModel.customExtractPrompt || Prompt_ExtractJson, {
        description,
        json: extractKeys
          .map(
            (item) =>
              `{"key":"${item.key}", "description":"${item.desc}"${
                item.enum ? `, "enum":"[${item.enum.split('\n')}]"` : ''
              }}`
          )
          .join('\n'),
        text: `${histories.map((item) => `${item.obj}:${item.value}`).join('\n')}
Human: ${content}`
      })
    }
  ];

  const ai = getAIApi({
    userKey: user.openaiAccount,
    timeout: 480000
  });
  const data = await ai.chat.completions.create({
    model: extractModel.model,
    temperature: 0.01,
    messages: adaptChat2GptMessages({ messages, reserveId: false }),
    stream: false
  });
  const answer = data.choices?.[0].message?.content || '';

  // parse response
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');

  if (start === -1 || end === -1)
    return {
      rawResponse: answer,
      tokens: countMessagesTokens(messages),
      arg: {}
    };

  try {
    return {
      rawResponse: answer,
      tokens: countMessagesTokens(messages),
      arg: json5.parse(answer) as Record<string, any>
    };
  } catch (error) {
    console.log(error);
    return {
      rawResponse: answer,
      tokens: countMessagesTokens(messages),
      arg: {}
    };
  }
}
