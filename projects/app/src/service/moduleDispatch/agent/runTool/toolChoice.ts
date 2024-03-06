import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { filterGptMessageByMaxTokens } from '@fastgpt/service/core/chat/utils';
import {
  ChatCompletion,
  ChatCompletionMessageToolCall,
  StreamChatType,
  ChatCompletionToolMessageParam,
  ChatCompletionAssistantToolParam,
  ChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type';
import { NextApiResponse } from 'next';
import { responseWrite, responseWriteController } from '@fastgpt/service/common/response';
import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';
import { textAdaptGptResponse } from '@/utils/adapt';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { dispatchModules } from '../../index';
import { DispatchToolProps, ToolModuleItemType } from './type.d';
import json5 from 'json5';

export const runToolWithToolChoice = async (
  props: DispatchToolProps & {
    messages: ChatCompletionMessageParam[];
    toolModules: ToolModuleItemType[];
    toolModel: LLMModelItemType;
  }
) => {
  const { toolModel, toolModules, messages, res, modules, stream } = props;

  const tools: any = toolModules.map((module) => {
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

  const filterMessages = filterGptMessageByMaxTokens({
    messages,
    maxTokens: toolModel.maxContext - 300 // filter token. not response maxToken
  });

  const ai = getAIApi({
    timeout: 480000
  });
  const response = await ai.chat.completions.create(
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
  console.log(JSON.stringify(filterMessages, null, 2));

  const { answer, toolCalls } = await (async () => {
    if (stream) {
      return streamResponse({
        res,
        toolModules,
        stream: response
      });
    } else {
      const aiResponse = response as ChatCompletion;
      return {
        answer: aiResponse.choices?.[0]?.message?.content || '',
        toolCalls: aiResponse.choices?.[0]?.message?.tool_calls || []
      };
    }
  })();

  const toolModulesRunResponse = (
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

        const moduleRunResponse = await dispatchModules({
          ...props,
          modules: modules.map((module) => ({
            ...module,
            isEntry: module.moduleId === toolModule.moduleId
          })),
          startParams
        });

        const toolResponse =
          moduleRunResponse.toolResponse.find((item) => item.moduleId === toolModule.moduleId)
            ?.value || {};

        const toolMsgParams: ChatCompletionToolMessageParam = {
          tool_call_id: tool.id,
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          name: tool.function.name,
          content: JSON.stringify(toolResponse)
        };

        return {
          moduleRunResponse,
          toolMsgParams
        };
      })
    )
  ).filter(Boolean);

  if (toolCalls.length > 0) {
    const assistantToolMsgParams: ChatCompletionAssistantToolParam = {
      role: 'assistant',
      tool_calls: toolCalls
    };
    const concatToolMessages = [
      ...filterMessages,
      assistantToolMsgParams,
      ...toolModulesRunResponse.map((item) => item?.toolMsgParams)
    ] as ChatCompletionMessageParam[];

    await runToolWithToolChoice({
      ...props,
      messages: concatToolMessages
    });
  }

  // done
  console.log('结束了');

  // console.log(answer, toolCalls);
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
      // 流响应中,每次只会返回一个工具.
      if (responseChoice.role === ChatCompletionRequestMessageRoleEnum.Assistant) {
        const toolCall: ChatCompletionMessageToolCall = responseChoice.tool_calls?.[0];
        const toolModule = toolModules.find(
          (module) => module.moduleId === toolCall.function?.name
        );

        if (toolModule) {
          if (toolCall.function?.arguments === undefined) {
            toolCall.function.arguments = '';
          }
          toolCalls.push(toolCall);
          responseWrite({
            write,
            event: sseResponseEventEnum.toolCall,
            data: textAdaptGptResponse({
              text: toolModule.name
            })
          });
          console.log('调用工具');
        }
      }
      /* arg 插入最后一个工具的参数里 */
      const arg: string = responseChoice.tool_calls?.[0]?.function?.arguments;
      const currentTool = toolCalls[toolCalls.length - 1];
      if (currentTool) {
        currentTool.function.arguments += arg;
        responseWrite({
          write,
          event: sseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text: arg
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
