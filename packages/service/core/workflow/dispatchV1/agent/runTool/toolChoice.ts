// @ts-nocheck
import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '../../../../ai/config';
import { filterGPTMessageByMaxTokens } from '../../../../chat/utils';
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
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { AIChatItemType } from '@fastgpt/global/core/chat/type';

type ToolRunResponseType = {
  moduleRunResponse: DispatchFlowResponse;
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

  const tools: ChatCompletionTool[] = toolModules.map((module) => {
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
      type: 'function',
      function: {
        name: module.moduleId,
        description: module.intro,
        parameters: {
          type: 'object',
          properties,
          required: module.toolParams.filter((item) => item.required).map((item) => item.key)
        }
      }
    };
  });

  const filterMessages = await filterGPTMessageByMaxTokens({
    messages,
    maxTokens: toolModel.maxContext - 300 // filter token. not response maxToken
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
      tools,
      tool_choice: 'auto'
    },
    {
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    }
  );

  const { answer, toolCalls } = await (async () => {
    if (stream) {
      return streamResponse({
        res,
        detail,
        toolModules,
        stream: aiResponse
      });
    } else {
      const result = aiResponse as ChatCompletion;
      const calls = result.choices?.[0]?.message?.tool_calls || [];

      // 加上name和avatar
      const toolCalls = calls.map((tool) => {
        const toolModule = toolModules.find((module) => module.moduleId === tool.function?.name);
        return {
          ...tool,
          toolName: toolModule?.name || '',
          toolAvatar: toolModule?.avatar || ''
        };
      });

      return {
        answer: result.choices?.[0]?.message?.content || '',
        toolCalls: toolCalls
      };
    }
  })();

  // Run the selected tool.
  const toolsRunResponse = (
    await Promise.all(
      toolCalls.map(async (tool) => {
        const toolModule = toolModules.find((module) => module.moduleId === tool.function?.name);

        if (!toolModule) return;

        const startParams = (() => {
          try {
            return json5.parse(tool.function.arguments);
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

        const toolMsgParams: ChatCompletionToolMessageParam = {
          tool_call_id: tool.id,
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          name: tool.function.name,
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
          toolMsgParams
        };
      })
    )
  ).filter(Boolean) as ToolRunResponseType;

  const flatToolsResponseData = toolsRunResponse.map((item) => item.moduleRunResponse).flat();
  if (toolCalls.length > 0 && !res.closed) {
    // Run the tool, combine its results, and perform another round of AI calls
    const assistantToolMsgParams: ChatCompletionAssistantToolParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      tool_calls: toolCalls
    };
    const concatToolMessages = [
      ...filterMessages,
      assistantToolMsgParams
    ] as ChatCompletionMessageParam[];
    const tokens = await countGptMessagesTokens(concatToolMessages, tools);
    const completeMessages = [
      ...concatToolMessages,
      ...toolsRunResponse.map((item) => item?.toolMsgParams)
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
        completeMessages,
        assistantResponses: toolNodeAssistants
      };
    }

    return runToolWithToolChoice(
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
    const tokens = await countGptMessagesTokens(completeMessages, tools);
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
  let toolCalls: ChatCompletionMessageToolCall[] = [];

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      break;
    }

    const responseChoice = part.choices?.[0]?.delta;
    // console.log(JSON.stringify(responseChoice, null, 2));
    if (responseChoice?.content) {
      const content = responseChoice.content || '';
      textAnswer += content;

      responseWrite({
        write,
        event: detail ? SseResponseEventEnum.answer : undefined,
        data: textAdaptGptResponse({
          text: content
        })
      });
    } else if (responseChoice?.tool_calls?.[0]) {
      const toolCall: ChatCompletionMessageToolCall = responseChoice.tool_calls[0];

      // 流响应中,每次只会返回一个工具. 如果带了 id，说明是执行一个工具
      if (toolCall.id) {
        const toolModule = toolModules.find(
          (module) => module.moduleId === toolCall.function?.name
        );

        if (toolModule) {
          if (toolCall.function?.arguments === undefined) {
            toolCall.function.arguments = '';
          }
          toolCalls.push({
            ...toolCall,
            toolName: toolModule.name,
            toolAvatar: toolModule.avatar
          });

          if (detail) {
            responseWrite({
              write,
              event: SseResponseEventEnum.toolCall,
              data: JSON.stringify({
                tool: {
                  id: toolCall.id,
                  toolName: toolModule.name,
                  toolAvatar: toolModule.avatar,
                  functionName: toolCall.function.name,
                  params: toolCall.function.arguments,
                  response: ''
                }
              })
            });
          }
        }
      }
      /* arg 插入最后一个工具的参数里 */
      const arg: string = responseChoice.tool_calls?.[0]?.function?.arguments;
      const currentTool = toolCalls[toolCalls.length - 1];
      if (currentTool) {
        currentTool.function.arguments += arg;

        if (detail) {
          responseWrite({
            write,
            event: SseResponseEventEnum.toolParams,
            data: JSON.stringify({
              tool: {
                id: currentTool.id,
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

  if (!textAnswer && toolCalls.length === 0) {
    return Promise.reject('LLM api response empty');
  }

  return { answer: textAnswer, toolCalls };
}
