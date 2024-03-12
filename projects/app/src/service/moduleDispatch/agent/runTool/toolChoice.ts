import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { filterGPTMessageByMaxTokens } from '@fastgpt/service/core/chat/utils';
import {
  ChatCompletion,
  ChatCompletionMessageToolCall,
  StreamChatType,
  ChatCompletionToolMessageParam,
  ChatCompletionAssistantToolParam,
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
import { NextApiResponse } from 'next';
import { responseWrite, responseWriteController } from '@fastgpt/service/common/response';
import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';
import { textAdaptGptResponse } from '@/utils/adapt';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { dispatchWorkFlow } from '../../index';
import { DispatchToolModuleProps, RunToolResponse, ToolModuleItemType } from './type.d';
import json5 from 'json5';
import { DispatchFlowResponse } from '../../type';
import { countGptMessagesTokens } from '@fastgpt/global/common/string/tiktoken';

type ToolRunResponseType = {
  moduleRunResponse: DispatchFlowResponse;
  toolMsgParams: ChatCompletionToolMessageParam;
}[];

export const runToolWithToolChoice = async (
  props: DispatchToolModuleProps & {
    messages: ChatCompletionMessageParam[];
    toolModules: ToolModuleItemType[];
    toolModel: LLMModelItemType;
  },
  response?: RunToolResponse
): Promise<RunToolResponse> => {
  const { toolModel, toolModules, messages, res, runtimeModules, module, stream } = props;

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

  const filterMessages = filterGPTMessageByMaxTokens({
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
        toolModules,
        stream: aiResponse
      });
    } else {
      const result = aiResponse as ChatCompletion;
      return {
        answer: result.choices?.[0]?.message?.content || '',
        toolCalls: result.choices?.[0]?.message?.tool_calls || []
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

        const moduleRunResponse = await dispatchWorkFlow({
          ...props,
          runtimeModules: runtimeModules.map((module) => ({
            ...module,
            isEntry: module.moduleId === toolModule.moduleId
          })),
          startParams
        });

        const toolMsgParams: ChatCompletionToolMessageParam = {
          tool_call_id: tool.id,
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          name: tool.function.name,
          content: JSON.stringify(moduleRunResponse.toolResponses, null, 2)
        };

        if (stream) {
          responseWrite({
            res,
            event: sseResponseEventEnum.toolResponse,
            data: JSON.stringify({
              tool: {
                id: tool.id,
                toolName: '',
                toolAvatar: '',
                params: '',
                response: JSON.stringify(moduleRunResponse.toolResponses, null, 2)
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

    const tokens = countGptMessagesTokens(concatToolMessages, tools);
    // console.log(
    //   JSON.stringify(
    //     {
    //       messages: concatToolMessages,
    //       tools
    //     },
    //     null,
    //     2
    //   )
    // );
    // console.log(tokens, 'tool');

    responseWrite({
      res,
      event: sseResponseEventEnum.moduleStatus,
      data: JSON.stringify({
        status: 'running',
        name: module.name
      })
    });

    return runToolWithToolChoice(
      {
        ...props,
        messages: [...concatToolMessages, ...toolsRunResponse.map((item) => item?.toolMsgParams)]
      },
      {
        dispatchFlowResponse: response
          ? response.dispatchFlowResponse.concat(flatToolsResponseData)
          : flatToolsResponseData,
        totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens
      }
    );
  } else {
    // No tool is invoked, indicating that the process is over
    const completeMessages = filterMessages.concat({
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: answer
    });

    const tokens = countGptMessagesTokens(completeMessages, tools);
    // console.log(
    //   JSON.stringify(
    //     {
    //       messages: completeMessages,
    //       tools
    //     },
    //     null,
    //     2
    //   )
    // );
    // console.log(tokens, 'response token');

    return {
      dispatchFlowResponse: response?.dispatchFlowResponse || [],
      totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
      completeMessages
    };
  }
};

async function streamResponse({
  res,
  toolModules,
  stream
}: {
  res: NextApiResponse;
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
    if (responseChoice.content) {
      const content = responseChoice?.content || '';
      textAnswer += content;

      responseWrite({
        write,
        event: sseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: content
        })
      });
    } else if (responseChoice.tool_calls?.[0]) {
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
          responseWrite({
            write,
            event: sseResponseEventEnum.toolCall,
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
      /* arg 插入最后一个工具的参数里 */
      const arg: string = responseChoice.tool_calls?.[0]?.function?.arguments;
      const currentTool = toolCalls[toolCalls.length - 1];
      if (currentTool) {
        currentTool.function.arguments += arg;
        responseWrite({
          write,
          event: sseResponseEventEnum.toolParams,
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

  if (!textAnswer && toolCalls.length === 0) {
    return Promise.reject('LLM api response empty');
  }

  return { answer: textAnswer, toolCalls };
}
