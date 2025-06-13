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
import {
  NodeOutputKeyEnum,
  toolValueTypeList,
  valueTypeJsonSchemaMap
} from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { sliceJsonStr } from '@fastgpt/global/common/string/tools';
import { type LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getHistories } from '../utils';
import { getLLMModel } from '../../../ai/model';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import json5 from 'json5';
import {
  type ChatCompletionMessageParam,
  type ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
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

type ActionProps = Props & { extractModel: LLMModelItemType; lastMemory?: Record<string, any> };

const agentFunName = 'request_function';

export async function dispatchContentExtract(props: Props): Promise<Response> {
  const {
    externalProvider,
    runningAppInfo,
    node: { nodeId, name },
    histories,
    params: { content, history = 6, model, description, extractKeys }
  } = props;

  if (!content) {
    return Promise.reject('Input is empty');
  }

  const extractModel = getLLMModel(model);
  const chatHistories = getHistories(history, histories);

  const memoryKey = `${runningAppInfo.id}-${nodeId}`;
  // @ts-ignore
  const lastMemory = chatHistories[chatHistories.length - 1]?.memories?.[memoryKey] as Record<
    string,
    any
  >;

  const { arg, inputTokens, outputTokens } = await (async () => {
    if (extractModel.toolChoice) {
      return toolChoice({
        ...props,
        histories: chatHistories,
        extractModel,
        lastMemory
      });
    }
    return completions({
      ...props,
      histories: chatHistories,
      extractModel,
      lastMemory
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
    [DispatchNodeResponseKeyEnum.memories]: {
      [memoryKey]: arg
    },
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

const getJsonSchema = ({ params: { extractKeys } }: ActionProps) => {
  const properties: Record<
    string,
    {
      type: string;
      description: string;
    }
  > = {};
  extractKeys.forEach((item) => {
    const jsonSchema = item.valueType
      ? valueTypeJsonSchemaMap[item.valueType] || toolValueTypeList[0].jsonSchema
      : toolValueTypeList[0].jsonSchema;

    properties[item.key] = {
      ...jsonSchema,
      description: item.desc,
      ...(item.enum ? { enum: item.enum.split('\n').filter(Boolean) } : {})
    };
  });

  return properties;
};

const toolChoice = async (props: ActionProps) => {
  const {
    externalProvider,
    extractModel,
    histories,
    params: { content, description },
    lastMemory
  } = props;

  const messages: ChatItemType[] = [
    {
      obj: ChatRoleEnum.System,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: getExtractJsonToolPrompt({
              systemPrompt: description,
              memory: lastMemory ? JSON.stringify(lastMemory) : undefined
            })
          }
        }
      ]
    },
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content
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

  const schema = getJsonSchema(props);

  const tools: ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: agentFunName,
        description: '需要执行的函数',
        parameters: {
          type: 'object',
          properties: schema,
          required: []
        }
      }
    }
  ];

  const body = llmCompletionsBodyFormat(
    {
      stream: true,
      model: extractModel.model,
      temperature: 0.01,
      messages: requestMessages,
      tools,
      tool_choice: { type: 'function', function: { name: agentFunName } }
    },
    extractModel
  );

  const { response } = await createChatCompletion({
    body,
    userKey: externalProvider.openaiAccount
  });
  const { text, toolCalls, usage } = await formatLLMResponse(response);

  const arg: Record<string, any> = (() => {
    try {
      return json5.parse(toolCalls?.[0]?.function?.arguments || text || '');
    } catch (error) {
      console.log('body', body);
      console.log('AI response', text, toolCalls?.[0]?.function);
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

const completions = async (props: ActionProps) => {
  const {
    extractModel,
    externalProvider,
    histories,
    lastMemory,
    params: { content, description }
  } = props;

  const messages: ChatItemType[] = [
    {
      obj: ChatRoleEnum.System,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: getExtractJsonPrompt({
              systemPrompt: description,
              memory: lastMemory ? JSON.stringify(lastMemory) : undefined,
              schema: JSON.stringify(getJsonSchema(props))
            })
          }
        }
      ]
    },
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content
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
