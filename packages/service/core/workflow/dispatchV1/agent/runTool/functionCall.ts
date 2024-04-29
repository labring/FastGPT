// @ts-nocheck
import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '../../../../ai/config';
import { filterGPTMessageByMaxTokens } from '../../../../chat/utils';
import {
  ChatCompletion,
  StreamChatType,
  ChatCompletionMessageParam,
  ChatCompletionCreateParams,
  ChatCompletionMessageFunctionCall,
  ChatCompletionFunctionMessageParam,
  ChatCompletionAssistantMessageParam
} from '@fastgpt/global/core/ai/type';
import { NextApiResponse } from 'next';
import {
  responseWrite,
  responseWriteController,
  responseWriteNodeStatus
} from '../../../../../common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { dispatchWorkFlowV1 } from '../../index';
import { DispatchToolModuleProps, RunToolResponse, ToolModuleItemType } from './type.d';
import json5 from 'json5';
import { DispatchFlowResponse } from '../../type';
import { countGptMessagesTokens } from '../../../../../common/string/tiktoken';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { AIChatItemType, AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';

type FunctionRunResponseType = {
  moduleRunResponse: DispatchFlowResponse;
  functionCallMsg: ChatCompletionFunctionMessageParam;
}[];

export const runToolWithFunctionCall = async (
  props: DispatchToolModuleProps & {
    messages: ChatCompletionMessageParam[];
    toolModules: ToolModuleItemType[];
    toolModel: LLMModelItemType;
  },
  response?: RunToolResponse
): Promise<RunToolResponse> => {
  const {
    toolModel,
    toolModules,
    messages,
    res,
    runtimeModules,
    detail = false,
    module,
    stream
  } = props;
  const assistantResponses = response?.assistantResponses || [];

  const functions: ChatCompletionCreateParams.Function[] = toolModules.map((module) => {
    const properties: Record<
      string,
      {
        type: string;
        description: string;
        required?: boolean;
      }
    > = {};
    module.toolParams.forEach((item) => {
      properties[item.key] = {
        type: 'string',
        description: item.toolDescription || ''
      };
    });

    return {
      name: module.moduleId,
      description: module.intro,
      parameters: {
        type: 'object',
        properties,
        required: module.toolParams.filter((item) => item.required).map((item) => item.key)
      }
    };
  });

  const filterMessages = await filterGPTMessageByMaxTokens({
    messages,
    maxTokens: toolModel.maxContext - 500 // filter token. not response maxToken
  });

  /* Run llm */
  const ai = getAIApi({
    timeout: 480000
  });
  const aiResponse = await ai.chat.completions.create(
    {
      ...toolModel?.defaultConfig,
      model: toolModel.model,
      temperature: 0,
      stream,
      messages: filterMessages,
      functions,
      function_call: 'auto'
    },
    {
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    }
  );

  const { answer, functionCalls } = await (async () => {
    if (stream) {
      return streamResponse({
        res,
        detail,
        toolModules,
        stream: aiResponse
      });
    } else {
      const result = aiResponse as ChatCompletion;
      const function_call = result.choices?.[0]?.message?.function_call;
      const toolModule = toolModules.find((module) => module.moduleId === function_call?.name);

      const toolCalls = function_call
        ? [
            {
              ...function_call,
              id: getNanoid(),
              toolName: toolModule?.name,
              toolAvatar: toolModule?.avatar
            }
          ]
        : [];

      return {
        answer: result.choices?.[0]?.message?.content || '',
        functionCalls: toolCalls
      };
    }
  })();

  // Run the selected tool.
  const toolsRunResponse = (
    await Promise.all(
      functionCalls.map(async (tool) => {
        if (!tool) return;

        const toolModule = toolModules.find((module) => module.moduleId === tool.name);

        if (!toolModule) return;

        const startParams = (() => {
          try {
            return json5.parse(tool.arguments);
          } catch (error) {
            return {};
          }
        })();

        const moduleRunResponse = await dispatchWorkFlowV1({
          ...props,
          runtimeModules: runtimeModules.map((module) => ({
            ...module,
            isEntry: module.moduleId === toolModule.moduleId
          })),
          startParams
        });

        const stringToolResponse = (() => {
          if (typeof moduleRunResponse.toolResponses === 'object') {
            return JSON.stringify(moduleRunResponse.toolResponses, null, 2);
          }

          return moduleRunResponse.toolResponses ? String(moduleRunResponse.toolResponses) : 'none';
        })();

        const functionCallMsg: ChatCompletionFunctionMessageParam = {
          role: ChatCompletionRequestMessageRoleEnum.Function,
          name: tool.name,
          content: stringToolResponse
        };

        if (stream && detail) {
          responseWrite({
            res,
            event: SseResponseEventEnum.toolResponse,
            data: JSON.stringify({
              tool: {
                id: tool.id,
                toolName: '',
                toolAvatar: '',
                params: '',
                response: stringToolResponse
              }
            })
          });
        }

        return {
          moduleRunResponse,
          functionCallMsg
        };
      })
    )
  ).filter(Boolean) as FunctionRunResponseType;

  const flatToolsResponseData = toolsRunResponse.map((item) => item.moduleRunResponse).flat();

  const functionCall = functionCalls[0];
  if (functionCall && !res.closed) {
    // Run the tool, combine its results, and perform another round of AI calls
    const assistantToolMsgParams: ChatCompletionAssistantMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      function_call: functionCall
    };
    const concatToolMessages = [
      ...filterMessages,
      assistantToolMsgParams
    ] as ChatCompletionMessageParam[];
    const tokens = await countGptMessagesTokens(concatToolMessages, undefined, functions);
    const completeMessages = [
      ...concatToolMessages,
      ...toolsRunResponse.map((item) => item?.functionCallMsg)
    ];
    // console.log(tokens, 'tool');

    if (stream && detail) {
      responseWriteNodeStatus({
        res,
        name: module.name
      });
    }

    // tool assistant
    const toolAssistants = toolsRunResponse
      .map((item) => {
        const assistantResponses = item.moduleRunResponse.assistantResponses || [];
        return assistantResponses;
      })
      .flat();
    // tool node assistant
    const adaptChatMessages = GPTMessages2Chats(completeMessages);
    const toolNodeAssistant = adaptChatMessages.pop() as AIChatItemType;

    const toolNodeAssistants = [
      ...assistantResponses,
      ...toolAssistants,
      ...toolNodeAssistant.value
    ];

    // concat tool responses
    const dispatchFlowResponse = response
      ? response.dispatchFlowResponse.concat(flatToolsResponseData)
      : flatToolsResponseData;

    /* check stop signal */
    const hasStopSignal = flatToolsResponseData.some(
      (item) => !!item.flowResponses?.find((item) => item.toolStop)
    );
    if (hasStopSignal) {
      return {
        dispatchFlowResponse,
        totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
        completeMessages: filterMessages,
        assistantResponses: toolNodeAssistants
      };
    }

    return runToolWithFunctionCall(
      {
        ...props,
        messages: completeMessages
      },
      {
        dispatchFlowResponse,
        totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
        assistantResponses: toolNodeAssistants
      }
    );
  } else {
    // No tool is invoked, indicating that the process is over
    const gptAssistantResponse: ChatCompletionAssistantMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: answer
    };
    const completeMessages = filterMessages.concat(gptAssistantResponse);
    const tokens = await countGptMessagesTokens(completeMessages, undefined, functions);
    // console.log(tokens, 'response token');

    // concat tool assistant
    const toolNodeAssistant = GPTMessages2Chats([gptAssistantResponse])[0] as AIChatItemType;

    return {
      dispatchFlowResponse: response?.dispatchFlowResponse || [],
      totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
      completeMessages,
      assistantResponses: [...assistantResponses, ...toolNodeAssistant.value]
    };
  }
};

async function streamResponse({
  res,
  detail,
  toolModules,
  stream
}: {
  res: NextApiResponse;
  detail: boolean;
  toolModules: ToolModuleItemType[];
  stream: StreamChatType;
}) {
  const write = responseWriteController({
    res,
    readStream: stream
  });

  let textAnswer = '';
  let functionCalls: ChatCompletionMessageFunctionCall[] = [];
  let functionId = getNanoid();

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      break;
    }

    const responseChoice = part.choices?.[0]?.delta;
    if (responseChoice.content) {
      const content = responseChoice?.content || '';
      textAnswer += content;

      responseWrite({
        write,
        event: detail ? SseResponseEventEnum.answer : undefined,
        data: textAdaptGptResponse({
          text: content
        })
      });
    } else if (responseChoice.function_call) {
      const functionCall: {
        arguments: string;
        name?: string;
      } = responseChoice.function_call;

      // 流响应中,每次只会返回一个函数，如果带了name，说明触发某个函数
      if (functionCall?.name) {
        functionId = getNanoid();
        const toolModule = toolModules.find((module) => module.moduleId === functionCall?.name);

        if (toolModule) {
          if (functionCall?.arguments === undefined) {
            functionCall.arguments = '';
          }
          functionCalls.push({
            ...functionCall,
            id: functionId,
            name: functionCall.name,
            toolName: toolModule.name,
            toolAvatar: toolModule.avatar
          });

          if (detail) {
            responseWrite({
              write,
              event: SseResponseEventEnum.toolCall,
              data: JSON.stringify({
                tool: {
                  id: functionId,
                  toolName: toolModule.name,
                  toolAvatar: toolModule.avatar,
                  functionName: functionCall.name,
                  params: functionCall.arguments,
                  response: ''
                }
              })
            });
          }
        }
      }
      /* arg 插入最后一个工具的参数里 */
      const arg: string = functionCall?.arguments || '';
      const currentTool = functionCalls[functionCalls.length - 1];
      if (currentTool) {
        currentTool.arguments += arg;

        if (detail) {
          responseWrite({
            write,
            event: SseResponseEventEnum.toolParams,
            data: JSON.stringify({
              tool: {
                id: functionId,
                toolName: '',
                toolAvatar: '',
                params: arg,
                response: ''
              }
            })
          });
        }
      }
    }
  }

  if (!textAnswer && functionCalls.length === 0) {
    return Promise.reject('LLM api response empty');
  }

  return { answer: textAnswer, functionCalls };
}
