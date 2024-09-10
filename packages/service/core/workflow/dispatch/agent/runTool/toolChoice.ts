import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '../../../../ai/config';
import { filterGPTMessageByMaxTokens, loadRequestMessages } from '../../../../chat/utils';
import {
  ChatCompletion,
  ChatCompletionMessageToolCall,
  StreamChatType,
  ChatCompletionToolMessageParam,
  ChatCompletionAssistantToolParam,
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
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { AIChatItemType } from '@fastgpt/global/core/chat/type';
import { updateToolInputValue } from './utils';
import { computedMaxToken, computedTemperature } from '../../../../ai/utils';
import { getNanoid, sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { addLog } from '../../../../../common/system/log';

type ToolRunResponseType = {
  toolRunResponse: DispatchFlowResponse;
  toolMsgParams: ChatCompletionToolMessageParam;
}[];

/* 
  调用思路
  1. messages 接收发送给AI的消息
  2. response 记录递归运行结果(累计计算 dispatchFlowResponse, totalTokens和assistantResponses)
  3. 如果运行工具的话，则需要把工具中的结果累计加到dispatchFlowResponse中。 本次消耗的 token 加到 totalTokens, assistantResponses 记录当前工具运行的内容。
*/

export const runToolWithToolChoice = async (
  props: DispatchToolModuleProps & {
    messages: ChatCompletionMessageParam[];
    toolNodes: ToolNodeItemType[];
    toolModel: LLMModelItemType;
    maxRunToolTimes: number;
  },
  response?: RunToolResponse
): Promise<RunToolResponse> => {
  const { messages, toolNodes, toolModel, maxRunToolTimes, ...workflowProps } = props;
  const {
    res,
    requestOrigin,
    runtimeNodes,
    node,
    stream,
    workflowStreamResponse,
    params: { temperature = 0, maxToken = 4000, aiChatVision }
  } = workflowProps;

  if (maxRunToolTimes <= 0 && response) {
    return response;
  }

  const assistantResponses = response?.assistantResponses || [];

  const tools: ChatCompletionTool[] = toolNodes.map((item) => {
    const properties: Record<
      string,
      {
        type: string;
        description: string;
        required?: boolean;
      }
    > = {};
    item.toolParams.forEach((item) => {
      properties[item.key] = {
        type: item.valueType || 'string',
        description: item.toolDescription || ''
      };
    });

    return {
      type: 'function',
      function: {
        name: item.nodeId,
        description: item.intro,
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
  const requestBody: any = {
    ...toolModel?.defaultConfig,
    model: toolModel.model,
    temperature: computedTemperature({
      model: toolModel,
      temperature
    }),
    max_tokens,
    stream,
    messages: requestMessages,
    tools,
    tool_choice: 'auto'
  };

  // console.log(JSON.stringify(requestBody, null, 2));
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

    const { answer, toolCalls } = await (async () => {
      if (res && stream) {
        return streamResponse({
          res,
          workflowStreamResponse,
          toolNodes,
          stream: aiResponse
        });
      } else {
        const result = aiResponse as ChatCompletion;
        const calls = result.choices?.[0]?.message?.tool_calls || [];

        // 加上name和avatar
        const toolCalls = calls.map((tool) => {
          const toolNode = toolNodes.find((item) => item.nodeId === tool.function?.name);
          return {
            ...tool,
            toolName: toolNode?.name || '',
            toolAvatar: toolNode?.avatar || ''
          };
        });

        return {
          answer: result.choices?.[0]?.message?.content || '',
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

          const toolRunResponse = await dispatchWorkFlow({
            ...workflowProps,
            isToolCall: true,
            runtimeNodes: runtimeNodes.map((item) =>
              item.nodeId === toolNode.nodeId
                ? {
                    ...item,
                    isEntry: true,
                    inputs: updateToolInputValue({ params: startParams, inputs: item.inputs })
                  }
                : {
                    ...item,
                    isEntry: false
                  }
            )
          });

          const stringToolResponse = (() => {
            if (typeof toolRunResponse.toolResponses === 'object') {
              return JSON.stringify(toolRunResponse.toolResponses, null, 2);
            }

            return toolRunResponse.toolResponses ? String(toolRunResponse.toolResponses) : 'none';
          })();

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
                response: sliceStrStartEnd(stringToolResponse, 500, 500)
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
      const assistantToolMsgParams: ChatCompletionAssistantToolParam = {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: toolCalls
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

      // console.log(tokens, 'tool');

      // Run tool status
      if (node.showStatus) {
        workflowStreamResponse?.({
          event: SseResponseEventEnum.flowNodeStatus,
          data: {
            status: 'running',
            name: node.name
          }
        });
      }

      // tool assistant
      const toolAssistants = toolsRunResponse
        .map((item) => {
          const assistantResponses = item.toolRunResponse.assistantResponses || [];
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
          completeMessages,
          assistantResponses: toolNodeAssistants,
          runTimes:
            (response?.runTimes || 0) +
            flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0)
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
          totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
          assistantResponses: toolNodeAssistants,
          runTimes:
            (response?.runTimes || 0) +
            flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0)
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
      // console.log(tokens, 'response token');

      // concat tool assistant
      const toolNodeAssistant = GPTMessages2Chats([gptAssistantResponse])[0] as AIChatItemType;

      return {
        dispatchFlowResponse: response?.dispatchFlowResponse || [],
        totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
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
            name: toolCall.function.name || '',
            arguments: toolCall.function.arguments || ''
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
