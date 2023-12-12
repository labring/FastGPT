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
import { getHistories } from '../utils';

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

const agentFunName = 'extract_json_data';

export async function dispatchContentExtract(props: Props): Promise<Response> {
  const {
    user,
    histories,
    inputs: { content, history = 6, description, extractKeys }
  } = props;

  if (!content) {
    return Promise.reject('Input is empty');
  }

  const extractModel = global.extractModels[0];

  const { arg, tokens } = await (async () => {
    if (extractModel.functionCall) {
      return functionCall({
        ...props,
        histories: getHistories(history, histories),
        extractModel
      });
    }
    return completions({
      ...props,
      histories: getHistories(history, histories),
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
  histories,
  inputs: { content, extractKeys, description }
}: Props & { extractModel: FunctionModelItemType }) {
  const messages: ChatItemType[] = [
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: `<任务描述>
${description || '根据用户要求提取适当的 JSON 字符串。'}

- 如果字段为空，你返回空字符串。
- 不要换行。
- 结合历史记录和文本进行提取。
</任务描述>

<文本>
${content}
</文本>`
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
    description,
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
    tools: [
      {
        type: 'function',
        function: agentFunction
      }
    ],
    tool_choice: { type: 'function', function: { name: agentFunName } }
  });

  const arg: Record<string, any> = (() => {
    try {
      return JSON.parse(
        response?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}'
      );
    } catch (error) {
      console.log(agentFunction.parameters);
      console.log(response.choices?.[0]?.message?.tool_calls?.[0]?.function);
      console.log('Your model may not support tool_call', error);
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
  histories,
  inputs: { content, extractKeys, description }
}: Props & { extractModel: FunctionModelItemType }) {
  const messages: ChatItemType[] = [
    {
      obj: ChatRoleEnum.Human,
      value: replaceVariable(extractModel.functionPrompt || Prompt_ExtractJson, {
        description,
        json: extractKeys
          .map(
            (item) =>
              `{"key":"${item.key}", "description":"${item.required}", "required":${item.required}}}`
          )
          .join('\n'),
        text: `${histories.map((item) => `${item.obj}:${item.value}`).join('\n')}
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
