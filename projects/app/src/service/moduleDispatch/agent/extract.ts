import { adaptChat2GptMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatContextFilter } from '@fastgpt/service/core/chat/utils';
import type { moduleDispatchResType, ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import type { ContextExtractAgentItemType } from '@fastgpt/global/core/module/type';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { Prompt_ExtractJson } from '@/global/core/prompt/agent';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { FunctionModelItemType } from '@fastgpt/global/core/ai/model.d';

type Props = ModuleDispatchProps<{
  [ModuleInputKeyEnum.history]?: ChatItemType[];
  [ModuleInputKeyEnum.contextExtractInput]: string;
  [ModuleInputKeyEnum.extractKeys]: ContextExtractAgentItemType[];
  [ModuleInputKeyEnum.description]: string;
}>;
type Response = {
  [ModuleOutputKeyEnum.success]?: boolean;
  [ModuleOutputKeyEnum.failed]?: boolean;
  [ModuleOutputKeyEnum.contextExtractFields]: string;
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
};

const agentFunName = 'agent_extract_data';

export async function dispatchContentExtract(props: Props): Promise<Response> {
  const {
    user,
    inputs: { content, description, extractKeys }
  } = props;

  if (!content) {
    return Promise.reject('Input is empty');
  }

  const extractModel = global.extractModels[0];

  const { arg, tokens } = await (async () => {
    if (extractModel.functionCall) {
      return functionCall({
        ...props,
        extractModel
      });
    }
    return completions({
      ...props,
      extractModel
    });
  })();

  // remove invalid key
  for (let key in arg) {
    if (!extractKeys.find((item) => item.key === key)) {
      delete arg[key];
    }
  }

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

  return {
    [ModuleOutputKeyEnum.success]: success ? true : undefined,
    [ModuleOutputKeyEnum.failed]: success ? undefined : true,
    [ModuleOutputKeyEnum.contextExtractFields]: JSON.stringify(arg),
    ...arg,
    [ModuleOutputKeyEnum.responseData]: {
      price: user.openaiAccount?.key ? 0 : extractModel.price * tokens,
      model: extractModel.name || '',
      query: content,
      tokens,
      extractDescription: description,
      extractResult: arg
    }
  };
}

async function functionCall({
  extractModel,
  user,
  inputs: { history = [], content, extractKeys, description }
}: Props & { extractModel: FunctionModelItemType }) {
  const messages: ChatItemType[] = [
    ...history,
    {
      obj: ChatRoleEnum.Human,
      value: content
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

  const ai = getAIApi(user.openaiAccount, 480000);

  const response = await ai.chat.completions.create({
    model: extractModel.model,
    temperature: 0,
    messages: [...adaptMessages],
    function_call: { name: agentFunName },
    functions: [agentFunction]
  });

  const arg: Record<string, any> = (() => {
    try {
      return JSON.parse(response.choices?.[0]?.message?.function_call?.arguments || '{}');
    } catch (error) {
      console.log(agentFunction.parameters);
      console.log(response.choices?.[0]?.message);
      console.log('Your model may not support function_call', error);
      return {};
    }
  })();

  const tokens = response.usage?.total_tokens || 0;
  return {
    tokens,
    arg
  };
}

async function completions({
  extractModel,
  user,
  inputs: { history = [], content, extractKeys, description }
}: Props & { extractModel: FunctionModelItemType }) {
  const messages: ChatItemType[] = [
    {
      obj: ChatRoleEnum.Human,
      value: replaceVariable(extractModel.functionPrompt || Prompt_ExtractJson, {
        description,
        json: extractKeys
          .map(
            (item) =>
              `key="${item.key}"，描述="${item.desc}"，required="${
                item.required ? 'true' : 'false'
              }"`
          )
          .join('\n'),
        text: `${history.map((item) => `${item.obj}:${item.value}`).join('\n')}
Human: ${content}`
      })
    }
  ];

  const ai = getAIApi(user.openaiAccount, 480000);

  const data = await ai.chat.completions.create({
    model: extractModel.model,
    temperature: 0.01,
    messages: adaptChat2GptMessages({ messages, reserveId: false }),
    stream: false
  });
  const answer = data.choices?.[0].message?.content || '';
  const totalTokens = data.usage?.total_tokens || 0;

  // parse response
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');

  if (start === -1 || end === -1)
    return {
      tokens: totalTokens,
      arg: {}
    };

  const jsonStr = answer
    .substring(start, end + 1)
    .replace(/(\\n|\\)/g, '')
    .replace(/  /g, '');

  try {
    return {
      tokens: totalTokens,
      arg: JSON.parse(jsonStr) as Record<string, any>
    };
  } catch (error) {
    return {
      tokens: totalTokens,
      arg: {}
    };
  }
}
