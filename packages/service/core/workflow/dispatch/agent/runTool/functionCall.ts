import { createChatCompletion } from '../../../../ai/config';
import { filterGPTMessageByMaxContext, loadRequestMessages } from '../../../../chat/utils';
import type {
  ChatCompletion,
  StreamChatType,
  ChatCompletionMessageParam,
  ChatCompletionCreateParams,
  ChatCompletionMessageFunctionCall,
  ChatCompletionFunctionMessageParam,
  ChatCompletionAssistantMessageParam,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/type.d';
import { type NextApiResponse } from 'next';
import { responseWriteController } from '../../../../../common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import {
  ChatCompletionRequestMessageRoleEnum,
  getLLMDefaultUsage
} from '@fastgpt/global/core/ai/constants';
import { dispatchWorkFlow } from '../../index';
import {
  type DispatchToolModuleProps,
  type RunToolResponse,
  type ToolNodeItemType
} from './type.d';
import json5 from 'json5';
import { type DispatchFlowResponse, type WorkflowResponseType } from '../../type';
import { countGptMessagesTokens } from '../../../../../common/string/tiktoken/index';
import { getNanoid, sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { type AIChatItemType } from '@fastgpt/global/core/chat/type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { formatToolResponse, initToolCallEdges, initToolNodes } from './utils';
import {
  computedMaxToken,
  llmCompletionsBodyFormat,
  removeDatasetCiteText,
  parseLLMStreamResponse
} from '../../../../ai/utils';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import { type WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';

type FunctionRunResponseType = {
  toolRunResponse: DispatchFlowResponse;
  functionCallMsg: ChatCompletionFunctionMessageParam;
}[];

export const runToolWithFunctionCall = async (
  props: DispatchToolModuleProps,
  response?: RunToolResponse
): Promise<RunToolResponse> => {
  const { messages, toolNodes, toolModel, interactiveEntryToolParams, ...workflowProps } = props;
  const {
    res,
    requestOrigin,
    runtimeNodes,
    runtimeEdges,
    externalProvider,
    stream,
    retainDatasetCite = true,
    workflowStreamResponse,
    params: {
      temperature,
      maxToken,
      aiChatVision,
      aiChatTopP,
      aiChatStopSign,
      aiChatResponseFormat,
      aiChatJsonSchema
    }
  } = workflowProps;

  // Interactive
  if (interactiveEntryToolParams) {
    initToolNodes(runtimeNodes, interactiveEntryToolParams.entryNodeIds);
    initToolCallEdges(runtimeEdges, interactiveEntryToolParams.entryNodeIds);

    // Run entry tool
    const toolRunResponse = await dispatchWorkFlow({
      ...workflowProps,
      isToolCall: true
    });
    const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

    workflowStreamResponse?.({
      event: SseResponseEventEnum.toolResponse,
      data: {
        tool: {
          id: interactiveEntryToolParams.toolCallId,
          toolName: '',
          toolAvatar: '',
          params: '',
          response: sliceStrStartEnd(stringToolResponse, 5000, 5000)
        }
      }
    });

    // Check stop signal
    const hasStopSignal = toolRunResponse.flowResponses?.some((item) => item.toolStop);
    // Check interactive response(Only 1 interaction is reserved)
    const workflowInteractiveResponse = toolRunResponse.workflowInteractiveResponse;

    const requestMessages = [
      ...messages,
      ...interactiveEntryToolParams.memoryMessages.map((item) =>
        !workflowInteractiveResponse &&
        item.role === 'function' &&
        item.name === interactiveEntryToolParams.toolCallId
          ? {
              ...item,
              content: stringToolResponse
            }
          : item
      )
    ];

    if (hasStopSignal || workflowInteractiveResponse) {
      // Get interactive tool data
      const toolWorkflowInteractiveResponse: WorkflowInteractiveResponseType | undefined =
        workflowInteractiveResponse
          ? {
              ...workflowInteractiveResponse,
              toolParams: {
                entryNodeIds: workflowInteractiveResponse.entryNodeIds,
                toolCallId: interactiveEntryToolParams.toolCallId,
                memoryMessages: [...interactiveEntryToolParams.memoryMessages]
              }
            }
          : undefined;

      return {
        dispatchFlowResponse: [toolRunResponse],
        toolNodeInputTokens: 0,
        toolNodeOutputTokens: 0,
        completeMessages: requestMessages,
        assistantResponses: toolRunResponse.assistantResponses,
        runTimes: toolRunResponse.runTimes,
        toolWorkflowInteractiveResponse
      };
    }

    return runToolWithFunctionCall(
      {
        ...props,
        interactiveEntryToolParams: undefined,
        // Rewrite toolCall messages
        messages: requestMessages
      },
      {
        dispatchFlowResponse: [toolRunResponse],
        toolNodeInputTokens: 0,
        toolNodeOutputTokens: 0,
        assistantResponses: toolRunResponse.assistantResponses,
        runTimes: toolRunResponse.runTimes
      }
    );
  }

  // ------------------------------------------------------------

  const assistantResponses = response?.assistantResponses || [];

  const functions: ChatCompletionCreateParams.Function[] = toolNodes.map((item) => {
    if (item.jsonSchema) {
      return {
        name: item.nodeId,
        description: item.intro,
        parameters: item.jsonSchema
      };
    }

    const properties: Record<
      string,
      {
        type: string;
        description: string;
        required?: boolean;
        enum?: string[];
      }
    > = {};
    item.toolParams.forEach((item) => {
      const jsonSchema = item.valueType
        ? valueTypeJsonSchemaMap[item.valueType] || toolValueTypeList[0].jsonSchema
        : toolValueTypeList[0].jsonSchema;

      properties[item.key] = {
        ...jsonSchema,
        description: item.toolDescription || '',
        enum: item.enum?.split('\n').filter(Boolean) || []
      };
    });

    return {
      name: item.nodeId,
      description: item.intro,
      parameters: {
        type: 'object',
        properties,
        required: item.toolParams.filter((item) => item.required).map((item) => item.key)
      }
    };
  });

  const max_tokens = computedMaxToken({
    model: toolModel,
    maxToken
  });
  const filterMessages = (
    await filterGPTMessageByMaxContext({
      messages,
      maxContext: toolModel.maxContext - (max_tokens || 0) // filter token. not response maxToken
    })
  ).map((item) => {
    if (item.role === ChatCompletionRequestMessageRoleEnum.Assistant && item.function_call) {
      return {
        ...item,
        function_call: {
          name: item.function_call?.name,
          arguments: item.function_call?.arguments
        },
        content: ''
      };
    }
    return item;
  });
  const [requestMessages] = await Promise.all([
    loadRequestMessages({
      messages: filterMessages,
      useVision: toolModel.vision && aiChatVision,
      origin: requestOrigin
    })
  ]);
  const requestBody = llmCompletionsBodyFormat(
    {
      model: toolModel.model,

      stream,
      messages: requestMessages,
      functions,
      function_call: 'auto',

      temperature,
      max_tokens,
      top_p: aiChatTopP,
      stop: aiChatStopSign,
      response_format: {
        type: aiChatResponseFormat as any,
        json_schema: aiChatJsonSchema
      }
    },
    toolModel
  );

  // console.log(JSON.stringify(requestMessages, null, 2));
  /* Run llm */
  const {
    response: aiResponse,
    isStreamResponse,
    getEmptyResponseTip
  } = await createChatCompletion({
    body: requestBody,
    userKey: externalProvider.openaiAccount,
    options: {
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    }
  });

  let { answer, functionCalls, inputTokens, outputTokens, finish_reason } = await (async () => {
    if (isStreamResponse) {
      if (!res || res.closed) {
        return {
          answer: '',
          functionCalls: [],
          inputTokens: 0,
          outputTokens: 0,
          finish_reason: 'close' as const
        };
      }
      const result = await streamResponse({
        res,
        toolNodes,
        stream: aiResponse,
        workflowStreamResponse,
        retainDatasetCite
      });

      return {
        answer: result.answer,
        functionCalls: result.functionCalls,
        inputTokens: result.usage.prompt_tokens,
        outputTokens: result.usage.completion_tokens,
        finish_reason: result.finish_reason
      };
    } else {
      const result = aiResponse as ChatCompletion;
      const finish_reason = result.choices?.[0]?.finish_reason as CompletionFinishReason;
      const function_call = result.choices?.[0]?.message?.function_call;
      const usage = result.usage;

      const toolNode = toolNodes.find((node) => node.nodeId === function_call?.name);

      const toolCalls = function_call
        ? [
            {
              ...function_call,
              id: getNanoid(),
              toolName: toolNode?.name,
              toolAvatar: toolNode?.avatar
            }
          ]
        : [];

      const answer = result.choices?.[0]?.message?.content || '';
      if (answer) {
        workflowStreamResponse?.({
          event: SseResponseEventEnum.fastAnswer,
          data: textAdaptGptResponse({
            text: removeDatasetCiteText(answer, retainDatasetCite)
          })
        });
      }

      return {
        answer,
        functionCalls: toolCalls,
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        finish_reason
      };
    }
  })();
  if (!answer && functionCalls.length === 0) {
    return Promise.reject(getEmptyResponseTip());
  }

  // Run the selected tool.
  const toolsRunResponse = (
    await Promise.all(
      functionCalls.map(async (tool) => {
        if (!tool) return;

        const toolNode = toolNodes.find((node) => node.nodeId === tool.name);

        if (!toolNode) return;

        const startParams = (() => {
          try {
            return json5.parse(tool.arguments);
          } catch (error) {
            return {};
          }
        })();

        initToolNodes(runtimeNodes, [toolNode.nodeId], startParams);
        const toolRunResponse = await dispatchWorkFlow({
          ...workflowProps,
          isToolCall: true
        });

        const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

        const functionCallMsg: ChatCompletionFunctionMessageParam = {
          role: ChatCompletionRequestMessageRoleEnum.Function,
          name: tool.name,
          content: stringToolResponse
        };

        workflowStreamResponse?.({
          event: SseResponseEventEnum.toolResponse,
          data: {
            tool: {
              id: tool.id,
              toolName: '',
              toolAvatar: '',
              params: '',
              response: sliceStrStartEnd(stringToolResponse, 500, 500)
            }
          }
        });

        return {
          toolRunResponse,
          functionCallMsg
        };
      })
    )
  ).filter(Boolean) as FunctionRunResponseType;

  const flatToolsResponseData = toolsRunResponse.map((item) => item.toolRunResponse).flat();
  // concat tool responses
  const dispatchFlowResponse = response
    ? response.dispatchFlowResponse.concat(flatToolsResponseData)
    : flatToolsResponseData;

  const functionCall = functionCalls[0];
  if (functionCall) {
    // Run the tool, combine its results, and perform another round of AI calls
    const assistantToolMsgParams: ChatCompletionAssistantMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      function_call: functionCall
    };

    /* 
      ...
      user
      assistant: tool data
    */
    const concatToolMessages = [
      ...requestMessages,
      assistantToolMsgParams
    ] as ChatCompletionMessageParam[];
    // Only toolCall tokens are counted here, Tool response tokens count towards the next reply
    // const tokens = await countGptMessagesTokens(concatToolMessages, undefined, functions);
    inputTokens =
      inputTokens || (await countGptMessagesTokens(requestMessages, undefined, functions));
    outputTokens = outputTokens || (await countGptMessagesTokens([assistantToolMsgParams]));
    /* 
      ...
      user
      assistant: tool data
      tool: tool response
    */
    const completeMessages = [
      ...concatToolMessages,
      ...toolsRunResponse.map((item) => item?.functionCallMsg)
    ];

    /* 
      Get tool node assistant response
      history assistant
      current tool assistant
      tool child assistant
    */
    const toolNodeAssistant = GPTMessages2Chats([
      assistantToolMsgParams,
      ...toolsRunResponse.map((item) => item?.functionCallMsg)
    ])[0] as AIChatItemType;
    const toolChildAssistants = flatToolsResponseData
      .map((item) => item.assistantResponses)
      .flat()
      .filter((item) => item.type !== ChatItemValueTypeEnum.interactive);
    const toolNodeAssistants = [
      ...assistantResponses,
      ...toolNodeAssistant.value,
      ...toolChildAssistants
    ];

    const runTimes =
      (response?.runTimes || 0) +
      flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0);
    const toolNodeInputTokens = response?.toolNodeInputTokens
      ? response.toolNodeInputTokens + inputTokens
      : inputTokens;
    const toolNodeOutputTokens = response?.toolNodeOutputTokens
      ? response.toolNodeOutputTokens + outputTokens
      : outputTokens;

    // Check stop signal
    const hasStopSignal = flatToolsResponseData.some(
      (item) => !!item.flowResponses?.find((item) => item.toolStop)
    );
    // Check interactive response(Only 1 interaction is reserved)
    const workflowInteractiveResponseItem = toolsRunResponse.find(
      (item) => item.toolRunResponse.workflowInteractiveResponse
    );
    if (hasStopSignal || workflowInteractiveResponseItem) {
      // Get interactive tool data
      const workflowInteractiveResponse =
        workflowInteractiveResponseItem?.toolRunResponse.workflowInteractiveResponse;

      // Flashback traverses completeMessages, intercepting messages that know the first user
      const firstUserIndex = completeMessages.findLastIndex((item) => item.role === 'user');
      const newMessages = completeMessages.slice(firstUserIndex + 1);

      const toolWorkflowInteractiveResponse: WorkflowInteractiveResponseType | undefined =
        workflowInteractiveResponse
          ? {
              ...workflowInteractiveResponse,
              toolParams: {
                entryNodeIds: workflowInteractiveResponse.entryNodeIds,
                toolCallId: workflowInteractiveResponseItem?.functionCallMsg.name,
                memoryMessages: newMessages
              }
            }
          : undefined;

      return {
        dispatchFlowResponse,
        toolNodeInputTokens,
        toolNodeOutputTokens,
        completeMessages,
        assistantResponses: toolNodeAssistants,
        runTimes,
        toolWorkflowInteractiveResponse,
        finish_reason
      };
    }

    return runToolWithFunctionCall(
      {
        ...props,
        messages: completeMessages
      },
      {
        dispatchFlowResponse,
        toolNodeInputTokens,
        toolNodeOutputTokens,
        assistantResponses: toolNodeAssistants,
        runTimes,
        finish_reason
      }
    );
  } else {
    // No tool is invoked, indicating that the process is over
    const gptAssistantResponse: ChatCompletionAssistantMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: answer
    };
    const completeMessages = filterMessages.concat(gptAssistantResponse);
    inputTokens =
      inputTokens || (await countGptMessagesTokens(requestMessages, undefined, functions));
    outputTokens = outputTokens || (await countGptMessagesTokens([gptAssistantResponse]));
    // console.log(tokens, 'response token');

    // concat tool assistant
    const toolNodeAssistant = GPTMessages2Chats([gptAssistantResponse])[0] as AIChatItemType;

    return {
      dispatchFlowResponse: response?.dispatchFlowResponse || [],
      toolNodeInputTokens: response?.toolNodeInputTokens
        ? response.toolNodeInputTokens + inputTokens
        : inputTokens,
      toolNodeOutputTokens: response?.toolNodeOutputTokens
        ? response.toolNodeOutputTokens + outputTokens
        : outputTokens,
      completeMessages,
      assistantResponses: [...assistantResponses, ...toolNodeAssistant.value],
      runTimes: (response?.runTimes || 0) + 1,
      finish_reason
    };
  }
};

async function streamResponse({
  res,
  toolNodes,
  stream,
  workflowStreamResponse,
  retainDatasetCite
}: {
  res: NextApiResponse;
  toolNodes: ToolNodeItemType[];
  stream: StreamChatType;
  workflowStreamResponse?: WorkflowResponseType;
  retainDatasetCite?: boolean;
}) {
  const write = responseWriteController({
    res,
    readStream: stream
  });

  let functionCalls: ChatCompletionMessageFunctionCall[] = [];
  let functionId = getNanoid();

  const { parsePart, getResponseData, updateFinishReason } = parseLLMStreamResponse();

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      updateFinishReason('close');
      break;
    }

    const { responseContent } = parsePart({
      part,
      parseThinkTag: false,
      retainDatasetCite
    });

    const responseChoice = part.choices?.[0]?.delta;

    if (responseContent) {
      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: responseContent
        })
      });
    } else if (responseChoice?.function_call) {
      const functionCall: {
        arguments?: string;
        name?: string;
      } = responseChoice.function_call;

      // 流响应中,每次只会返回一个函数，如果带了name，说明触发某个函数
      if (functionCall?.name) {
        functionId = getNanoid();
        const toolNode = toolNodes.find((item) => item.nodeId === functionCall?.name);

        if (toolNode) {
          functionCalls.push({
            ...functionCall,
            arguments: functionCall.arguments || '',
            id: functionId,
            name: functionCall.name,
            toolName: toolNode.name,
            toolAvatar: toolNode.avatar
          });

          workflowStreamResponse?.({
            write,
            event: SseResponseEventEnum.toolCall,
            data: {
              tool: {
                id: functionId,
                toolName: toolNode.name,
                toolAvatar: toolNode.avatar,
                functionName: functionCall.name,
                params: functionCall.arguments || '',
                response: ''
              }
            }
          });
        }

        continue;
      }

      /* arg 插入最后一个工具的参数里 */
      const arg: string = functionCall?.arguments || '';
      const currentTool = functionCalls[functionCalls.length - 1];
      if (currentTool) {
        currentTool.arguments += arg;

        workflowStreamResponse?.({
          write,
          event: SseResponseEventEnum.toolParams,
          data: {
            tool: {
              id: functionId,
              toolName: '',
              toolAvatar: '',
              params: arg,
              response: ''
            }
          }
        });
      }
    }
  }

  const { content, finish_reason, usage } = getResponseData();

  return { answer: content, functionCalls, finish_reason, usage };
}
