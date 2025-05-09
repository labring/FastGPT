import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { filterGPTMessageByMaxContext, loadRequestMessages } from '../../../chat/utils';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import {
  countMessagesTokens,
  countGptMessagesTokens,
  countPromptTokens
} from '../../../../common/string/tiktoken/index';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { createChatCompletion } from '../../../ai/config';
import type { ContextExtractAgentItemType } from '@fastgpt/global/core/workflow/template/system/contextExtract/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum, toolValueTypeList } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { replaceVariable, sliceJsonStr } from '@fastgpt/global/common/string/tools';
import { type LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getHistories } from '../utils';
import { getLLMModel } from '../../../ai/model';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import json5 from 'json5';
import {
  type ChatCompletionMessageParam,
  type ChatCompletionTool,
  type UnStreamChatType
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { llmCompletionsBodyFormat, formatLLMResponse } from '../../../ai/utils';
import { ModelTypeEnum } from '../../../../../global/core/ai/model';
import {
  getExtractJsonPrompt,
  getExtractJsonToolPrompt
} from '@fastgpt/global/core/ai/prompt/agent';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemType[];
  [NodeInputKeyEnum.contextExtractInput]: string;
  [NodeInputKeyEnum.extractKeys]: ContextExtractAgentItemType[];
  [NodeInputKeyEnum.description]: string;
  [NodeInputKeyEnum.aiModel]: string;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.success]: boolean;
  [NodeOutputKeyEnum.contextExtractFields]: string;
}>;

type ActionProps = Props & { extractModel: LLMModelItemType };

const agentFunName = 'request_function';

export async function dispatchContentExtract(props: Props): Promise<Response> {
  const {
    externalProvider,
    node: { name },
    histories,
    params: { content, history = 6, model, description, extractKeys }
  } = props;

  if (!content) {
    return Promise.reject('Input is empty');
  }

  const extractModel = getLLMModel(model);
  const chatHistories = getHistories(history, histories);

  const { arg, inputTokens, outputTokens } = await (async () => {
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
    if (item.required && arg[item.key] === undefined) {
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
    inputTokens: inputTokens,
    outputTokens: outputTokens,
    modelType: ModelTypeEnum.llm
  });

  return {
    [NodeOutputKeyEnum.success]: success,
    [NodeOutputKeyEnum.contextExtractFields]: JSON.stringify(arg),
    ...arg,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: externalProvider.openaiAccount?.key ? 0 : totalPoints,
      model: modelName,
      query: content,
      inputTokens,
      outputTokens,
      extractDescription: description,
      extractResult: arg,
      contextTotalLen: chatHistories.length + 2
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        moduleName: name,
        totalPoints: externalProvider.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        inputTokens,
        outputTokens
      }
    ]
  };
}

const getFunctionCallSchema = async ({
  extractModel,
  histories,
  params: { content, extractKeys, description },
  node: { version }
}: ActionProps) => {
  const messages: ChatItemType[] = [
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: replaceVariable(getExtractJsonToolPrompt(version), {
              description,
              content
            })
          }
        }
      ]
    }
  ];
  const adaptMessages = chats2GPTMessages({ messages, reserveId: false });
  const filterMessages = await filterGPTMessageByMaxContext({
    messages: adaptMessages,
    maxContext: extractModel.maxContext
  });
  const requestMessages = await loadRequestMessages({
    messages: filterMessages,
    useVision: false
  });

  const properties: Record<
    string,
    {
      type: string;
      description: string;
    }
  > = {};
  extractKeys.forEach((item) => {
    const jsonSchema = (
      toolValueTypeList.find((type) => type.value === item.valueType) || toolValueTypeList[0]
    )?.jsonSchema;
    properties[item.key] = {
      ...jsonSchema,
      description: item.desc,
      ...(item.enum ? { enum: item.enum.split('\n').filter(Boolean) } : {})
    };
  });
  // function body
  const agentFunction = {
    name: agentFunName,
    description: '需要执行的函数',
    parameters: {
      type: 'object',
      properties,
      required: []
    }
  };

  return {
    filterMessages: requestMessages,
    agentFunction
  };
};

const toolChoice = async (props: ActionProps) => {
  const { externalProvider, extractModel } = props;

  const { filterMessages, agentFunction } = await getFunctionCallSchema(props);

  const tools: ChatCompletionTool[] = [
    {
      type: 'function',
      function: agentFunction
    }
  ];

  const { response } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        stream: true,
        model: extractModel.model,
        temperature: 0.01,
        messages: filterMessages,
        tools,
        tool_choice: { type: 'function', function: { name: agentFunName } }
      },
      extractModel
    ),
    userKey: externalProvider.openaiAccount
  });
  const { toolCalls, usage } = await formatLLMResponse(response);

  const arg: Record<string, any> = (() => {
    try {
      return json5.parse(toolCalls?.[0]?.function?.arguments || '');
    } catch (error) {
      console.log(agentFunction.parameters);
      console.log(toolCalls?.[0]?.function);
      console.log('Your model may not support tool_call', error);
      return {};
    }
  })();

  const AIMessages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      tool_calls: toolCalls
    }
  ];

  const inputTokens = usage?.prompt_tokens || (await countGptMessagesTokens(filterMessages, tools));
  const outputTokens = usage?.completion_tokens || (await countGptMessagesTokens(AIMessages));
  return {
    inputTokens,
    outputTokens,
    arg
  };
};

const completions = async ({
  extractModel,
  externalProvider,
  histories,
  params: { content, extractKeys, description = 'No special requirements' },
  node: { version }
}: ActionProps) => {
  const messages: ChatItemType[] = [
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: replaceVariable(
              extractModel.customExtractPrompt || getExtractJsonPrompt(version),
              {
                description,
                json: extractKeys
                  .map((item) => {
                    const valueType = item.valueType || 'string';
                    if (valueType !== 'string' && valueType !== 'number') {
                      item.enum = undefined;
                    }

                    return `{"type":${item.valueType || 'string'}, "key":"${item.key}", "description":"${item.desc}" ${
                      item.enum ? `, "enum":"[${item.enum.split('\n')}]"` : ''
                    }}`;
                  })
                  .join('\n'),
                text: `${histories.map((item) => `${item.obj}:${chatValue2RuntimePrompt(item.value).text}`).join('\n')}
Human: ${content}`
              }
            )
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
        model: extractModel.model,
        temperature: 0.01,
        messages: requestMessages,
        stream: true
      },
      extractModel
    ),
    userKey: externalProvider.openaiAccount
  });
  const { text: answer, usage } = await formatLLMResponse(response);
  const inputTokens = usage?.prompt_tokens || (await countMessagesTokens(messages));
  const outputTokens = usage?.completion_tokens || (await countPromptTokens(answer));

  // parse response
  const jsonStr = sliceJsonStr(answer);

  if (!jsonStr) {
    return {
      rawResponse: answer,
      inputTokens,
      outputTokens,
      arg: {}
    };
  }

  try {
    return {
      rawResponse: answer,
      inputTokens,
      outputTokens,
      arg: json5.parse(jsonStr) as Record<string, any>
    };
  } catch (error) {
    console.log('Extract error, ai answer:', answer);
    console.log(error);
    return {
      rawResponse: answer,
      inputTokens,
      outputTokens,
      arg: {}
    };
  }
};
