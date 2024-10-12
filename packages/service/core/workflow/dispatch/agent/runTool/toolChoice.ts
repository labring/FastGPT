import { getAIApi } from '../../../../ai/config';
import { filterGPTMessageByMaxTokens, loadRequestMessages } from '../../../../chat/utils';
import {
  ChatCompletion,
  ChatCompletionMessageToolCall,
  StreamChatType,
  ChatCompletionToolMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionAssistantMessageParam
} from '@fastgpt/global/core/ai/type';
import { NextApiResponse } from 'next';
import { responseWriteController } from '../../../../../common/response';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { dispatchWorkFlow } from '../../index';
import { DispatchToolModuleProps, RunToolResponse, ToolNodeItemType } from './type.d';
import json5 from 'json5';
import { DispatchFlowResponse, WorkflowResponseType } from '../../type';
import { countGptMessagesTokens } from '../../../../../common/string/tiktoken/index';
import { chats2GPTMessages, GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { AIChatItemType } from '@fastgpt/global/core/chat/type';
import { formatToolResponse, initToolCallEdges, initToolNodes } from './utils';
import { computedMaxToken, llmCompletionsBodyFormat } from '../../../../ai/utils';
import { getNanoid, sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { addLog } from '../../../../../common/system/log';
import { toolValueTypeList } from '@fastgpt/global/core/workflow/constants';
import { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

type ToolRunResponseType = {
  toolRunResponse: DispatchFlowResponse;
  toolMsgParams: ChatCompletionToolMessageParam;
}[];

/* 
  调用思路
  1. messages 接收发送给AI的消息
  2. response 记录递归运行结果(累计计算 dispatchFlowResponse, totalTokens和assistantResponses)
  3. 如果运行工具的话，则需要把工具中的结果累计加到dispatchFlowResponse中。 本次消耗的 token 加到 toolNodeTokens, assistantResponses 记录当前工具运行的内容。
*/

export const runToolWithToolChoice = async (
  props: DispatchToolModuleProps & {
    maxRunToolTimes: number;
  },
  response?: RunToolResponse
): Promise<RunToolResponse> => {
  const {
    messages,
    toolNodes,
    toolModel,
    maxRunToolTimes,
    interactiveEntryToolParams,
    ...workflowProps
  } = props;
  const {
    res,
    requestOrigin,
    runtimeNodes,
    runtimeEdges,
    stream,
    workflowStreamResponse,
    params: { temperature = 0, maxToken = 4000, aiChatVision }
  } = workflowProps;

  if (maxRunToolTimes <= 0 && response) {
    return response;
  }

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

    // Response to frontend
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
        item.role === 'tool' && item.tool_call_id === interactiveEntryToolParams.toolCallId
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
                memoryMessages: interactiveEntryToolParams.memoryMessages
              }
            }
          : undefined;

      return {
        dispatchFlowResponse: [toolRunResponse],
        toolNodeTokens: 0,
        completeMessages: requestMessages,
        assistantResponses: toolRunResponse.assistantResponses,
        runTimes: toolRunResponse.runTimes,
        toolWorkflowInteractiveResponse
      };
    }

    return runToolWithToolChoice(
      {
        ...props,
        interactiveEntryToolParams: undefined,
        maxRunToolTimes: maxRunToolTimes - 1,
        // Rewrite toolCall messages
        messages: requestMessages
      },
      {
        dispatchFlowResponse: [toolRunResponse],
        toolNodeTokens: 0,
        assistantResponses: toolRunResponse.assistantResponses,
        runTimes: toolRunResponse.runTimes
      }
    );
  }

  // ------------------------------------------------------------

  const assistantResponses = response?.assistantResponses || [];

  const tools: ChatCompletionTool[] = toolNodes.map((item) => {
    const properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
        required?: boolean;
        items?: {
          type: string;
        };
      }
    > = {};
    item.toolParams.forEach((item) => {
      const jsonSchema = (
        toolValueTypeList.find((type) => type.value === item.valueType) || toolValueTypeList[0]
      )?.jsonSchema;
      properties[item.key] = {
        ...jsonSchema,
        description: item.toolDescription || '',
        enum: item.enum?.split('\n').filter(Boolean) || []
      };
    });

    return {
      type: 'function',
      function: {
        name: item.nodeId,
        description: item.intro || item.name,
        parameters: {
          type: 'object',
          properties,
          required: item.toolParams.filter((item) => item.required).map((item) => item.key)
        }
      }
    };
  });
  // Filter histories by maxToken
  const filterMessages = (
    await filterGPTMessageByMaxTokens({
      messages,
      maxTokens: toolModel.maxContext - 300 // filter token. not response maxToken
    })
  ).map((item) => {
    if (item.role === 'assistant' && item.tool_calls) {
      return {
        ...item,
        tool_calls: item.tool_calls.map((tool) => ({
          id: tool.id,
          type: tool.type,
          function: tool.function
        }))
      };
    }
    return item;
  });

  const [requestMessages, max_tokens] = await Promise.all([
    loadRequestMessages({
      messages: filterMessages,
      useVision: toolModel.vision && aiChatVision,
      origin: requestOrigin
    }),
    computedMaxToken({
      model: toolModel,
      maxToken,
      filterMessages
    })
  ]);
  const requestBody = llmCompletionsBodyFormat(
    {
      model: toolModel.model,
      temperature,
      max_tokens,
      stream,
      messages: requestMessages,
      tools,
      tool_choice: 'auto'
    },
    toolModel
  );
  // console.log(JSON.stringify(requestMessages, null, 2), '==requestBody');
  /* Run llm */
  const ai = getAIApi({
    timeout: 480000
  });

  try {
    const aiResponse = await ai.chat.completions.create(requestBody, {
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    });
    const isStreamResponse =
      typeof aiResponse === 'object' &&
      aiResponse !== null &&
      ('iterator' in aiResponse || 'controller' in aiResponse);

    const { answer, toolCalls } = await (async () => {
      if (res && isStreamResponse) {
        return streamResponse({
          res,
          workflowStreamResponse,
          toolNodes,
          stream: aiResponse
        });
      } else {
        const result = aiResponse as ChatCompletion;
        const calls = result.choices?.[0]?.message?.tool_calls || [];
        const answer = result.choices?.[0]?.message?.content || '';

        // 加上name和avatar
        const toolCalls = calls.map((tool) => {
          const toolNode = toolNodes.find((item) => item.nodeId === tool.function?.name);
          return {
            ...tool,
            toolName: toolNode?.name || '',
            toolAvatar: toolNode?.avatar || ''
          };
        });

        // 不支持 stream 模式的模型的流失响应
        toolCalls.forEach((tool) => {
          workflowStreamResponse?.({
            event: SseResponseEventEnum.toolCall,
            data: {
              tool: {
                id: tool.id,
                toolName: tool.toolName,
                toolAvatar: tool.toolAvatar,
                functionName: tool.function.name,
                params: tool.function?.arguments ?? '',
                response: ''
              }
            }
          });
        });
        if (answer) {
          workflowStreamResponse?.({
            event: SseResponseEventEnum.fastAnswer,
            data: textAdaptGptResponse({
              text: answer
            })
          });
        }

        return {
          answer,
          toolCalls: toolCalls
        };
      }
    })();

    // Run the selected tool by LLM.
    const toolsRunResponse = (
      await Promise.all(
        toolCalls.map(async (tool) => {
          const toolNode = toolNodes.find((item) => item.nodeId === tool.function?.name);

          if (!toolNode) return;

          const startParams = (() => {
            try {
              return json5.parse(tool.function.arguments);
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

          const toolMsgParams: ChatCompletionToolMessageParam = {
            tool_call_id: tool.id,
            role: ChatCompletionRequestMessageRoleEnum.Tool,
            name: tool.function.name,
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
                response: sliceStrStartEnd(stringToolResponse, 5000, 5000)
              }
            }
          });

          return {
            toolRunResponse,
            toolMsgParams
          };
        })
      )
    ).filter(Boolean) as ToolRunResponseType;

    const flatToolsResponseData = toolsRunResponse.map((item) => item.toolRunResponse).flat();

    if (toolCalls.length > 0 && !res?.closed) {
      // Run the tool, combine its results, and perform another round of AI calls
      const assistantToolMsgParams: ChatCompletionAssistantMessageParam[] = [
        ...(answer
          ? [
              {
                role: ChatCompletionRequestMessageRoleEnum.Assistant as 'assistant',
                content: answer
              }
            ]
          : []),
        {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          tool_calls: toolCalls
        }
      ];

      /* 
        ...
        user
        assistant: tool data
      */
      const concatToolMessages = [
        ...requestMessages,
        ...assistantToolMsgParams
      ] as ChatCompletionMessageParam[];

      // Only toolCall tokens are counted here, Tool response tokens count towards the next reply
      const tokens = await countGptMessagesTokens(concatToolMessages, tools);
      /* 
        ...
        user
        assistant: tool data
        tool: tool response
      */
      const completeMessages = [
        ...concatToolMessages,
        ...toolsRunResponse.map((item) => item?.toolMsgParams)
      ];

      // Assistant tool response adapt to chatStore
      const toolNodeAssistant = GPTMessages2Chats([
        ...assistantToolMsgParams,
        ...toolsRunResponse.map((item) => item?.toolMsgParams)
      ])[0] as AIChatItemType;
      const toolChildAssistants = flatToolsResponseData
        .map((item) => item.assistantResponses)
        .flat()
        .filter((item) => item.type !== ChatItemValueTypeEnum.interactive);
      /* 
        history assistant
        current tool assistant
        tool child assistant
      */
      const toolNodeAssistants = [
        ...assistantResponses,
        ...toolNodeAssistant.value,
        ...toolChildAssistants
      ];

      // concat tool responses
      const dispatchFlowResponse = response
        ? response.dispatchFlowResponse.concat(flatToolsResponseData)
        : flatToolsResponseData;
      const runTimes =
        (response?.runTimes || 0) +
        flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0);
      const toolNodeTokens = response ? response.toolNodeTokens + tokens : tokens;

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
        const toolWorkflowInteractiveResponse: WorkflowInteractiveResponseType | undefined =
          workflowInteractiveResponse
            ? {
                ...workflowInteractiveResponse,
                toolParams: {
                  entryNodeIds: workflowInteractiveResponse.entryNodeIds,
                  toolCallId: workflowInteractiveResponseItem?.toolMsgParams.tool_call_id,
                  memoryMessages: [
                    ...chats2GPTMessages({
                      messages: [
                        {
                          obj: ChatRoleEnum.AI,
                          value: assistantResponses
                        }
                      ],
                      reserveId: false,
                      reserveTool: true
                    }),
                    ...assistantToolMsgParams,
                    ...toolsRunResponse.map((item) => item?.toolMsgParams)
                  ]
                }
              }
            : undefined;

        return {
          dispatchFlowResponse,
          toolNodeTokens,
          completeMessages,
          assistantResponses: toolNodeAssistants,
          runTimes,
          toolWorkflowInteractiveResponse
        };
      }

      return runToolWithToolChoice(
        {
          ...props,
          maxRunToolTimes: maxRunToolTimes - 1,
          messages: completeMessages
        },
        {
          dispatchFlowResponse,
          toolNodeTokens,
          assistantResponses: toolNodeAssistants,
          runTimes
        }
      );
    } else {
      // No tool is invoked, indicating that the process is over
      const gptAssistantResponse: ChatCompletionAssistantMessageParam = {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: answer
      };
      const completeMessages = filterMessages.concat(gptAssistantResponse);
      const tokens = await countGptMessagesTokens(completeMessages, tools);

      // concat tool assistant
      const toolNodeAssistant = GPTMessages2Chats([gptAssistantResponse])[0] as AIChatItemType;

      return {
        dispatchFlowResponse: response?.dispatchFlowResponse || [],
        toolNodeTokens: response ? response.toolNodeTokens + tokens : tokens,
        completeMessages,
        assistantResponses: [...assistantResponses, ...toolNodeAssistant.value],
        runTimes: (response?.runTimes || 0) + 1
      };
    }
  } catch (error) {
    console.log(error);
    addLog.warn(`LLM response error`, {
      requestBody
    });
    return Promise.reject(error);
  }
};

async function streamResponse({
  res,
  toolNodes,
  stream,
  workflowStreamResponse
}: {
  res: NextApiResponse;
  toolNodes: ToolNodeItemType[];
  stream: StreamChatType;
  workflowStreamResponse?: WorkflowResponseType;
}) {
  const write = responseWriteController({
    res,
    readStream: stream
  });

  let textAnswer = '';
  let callingTool: { name: string; arguments: string } | null = null;
  let toolCalls: ChatCompletionMessageToolCall[] = [];

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      break;
    }

    const responseChoice = part.choices?.[0]?.delta;

    if (responseChoice?.content) {
      const content = responseChoice.content || '';
      textAnswer += content;

      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: content
        })
      });
    } else if (responseChoice?.tool_calls?.[0]) {
      const toolCall: ChatCompletionMessageToolCall = responseChoice.tool_calls[0];
      // In a stream response, only one tool is returned at a time.  If have id, description is executing a tool
      if (toolCall.id || callingTool) {
        // Start call tool
        if (toolCall.id) {
          callingTool = {
            name: toolCall.function?.name || '',
            arguments: toolCall.function?.arguments || ''
          };
        } else if (callingTool) {
          // Continue call
          callingTool.name += toolCall.function.name || '';
          callingTool.arguments += toolCall.function.arguments || '';
        }

        const toolFunction = callingTool!;

        const toolNode = toolNodes.find((item) => item.nodeId === toolFunction.name);

        if (toolNode) {
          // New tool, add to list.
          const toolId = getNanoid();
          toolCalls.push({
            ...toolCall,
            id: toolId,
            type: 'function',
            function: toolFunction,
            toolName: toolNode.name,
            toolAvatar: toolNode.avatar
          });

          workflowStreamResponse?.({
            event: SseResponseEventEnum.toolCall,
            data: {
              tool: {
                id: toolId,
                toolName: toolNode.name,
                toolAvatar: toolNode.avatar,
                functionName: toolFunction.name,
                params: toolFunction?.arguments ?? '',
                response: ''
              }
            }
          });
          callingTool = null;
        }
      } else {
        /* arg 插入最后一个工具的参数里 */
        const arg: string = toolCall?.function?.arguments ?? '';
        const currentTool = toolCalls[toolCalls.length - 1];
        if (currentTool && arg) {
          currentTool.function.arguments += arg;

          workflowStreamResponse?.({
            write,
            event: SseResponseEventEnum.toolParams,
            data: {
              tool: {
                id: currentTool.id,
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
  }

  if (!textAnswer && toolCalls.length === 0) {
    return Promise.reject('LLM api response empty');
  }

  return { answer: textAnswer, toolCalls };
}
