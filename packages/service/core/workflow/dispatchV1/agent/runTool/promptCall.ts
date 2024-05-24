// @ts-nocheck
import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '../../../../ai/config';
import { filterGPTMessageByMaxTokens } from '../../../../chat/utils';
import {
  ChatCompletion,
  StreamChatType,
  ChatCompletionMessageParam,
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
import { countGptMessagesTokens } from '../../../../../common/string/tiktoken';
import { getNanoid, replaceVariable } from '@fastgpt/global/common/string/tools';
import { AIChatItemType } from '@fastgpt/global/core/chat/type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';

type FunctionCallCompletion = {
  id: string;
  name: string;
  arguments: string;
  toolName?: string;
  toolAvatar?: string;
};

export const runToolWithPromptCall = async (
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

  const toolsPrompt = JSON.stringify(
    toolModules.map((module) => {
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
        toolId: module.moduleId,
        description: module.intro,
        parameters: {
          type: 'object',
          properties,
          required: module.toolParams.filter((item) => item.required).map((item) => item.key)
        }
      };
    })
  );

  const lastMessage = messages[messages.length - 1];
  if (typeof lastMessage.content !== 'string') {
    return Promise.reject('暂时只支持纯文本');
  }
  lastMessage.content = replaceVariable(lastMessage.content, {
    toolsPrompt
  });

  const filterMessages = await filterGPTMessageByMaxTokens({
    messages,
    maxTokens: toolModel.maxContext - 500 // filter token. not response maxToken
  });
  // console.log(JSON.stringify(filterMessages, null, 2));
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
      messages: filterMessages
    },
    {
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    }
  );

  const answer = await (async () => {
    if (stream) {
      const { answer } = await streamResponse({
        res,
        detail,
        toolModules,
        stream: aiResponse
      });

      return answer;
    } else {
      const result = aiResponse as ChatCompletion;

      return result.choices?.[0]?.message?.content || '';
    }
  })();

  const parseAnswerResult = parseAnswer(answer);
  // console.log(parseAnswer, '==11==');
  // No tools
  if (typeof parseAnswerResult === 'string') {
    // No tool is invoked, indicating that the process is over
    const gptAssistantResponse: ChatCompletionAssistantMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: parseAnswerResult
    };
    const completeMessages = filterMessages.concat(gptAssistantResponse);
    const tokens = await countGptMessagesTokens(completeMessages, undefined);
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

  // Run the selected tool.
  const toolsRunResponse = await (async () => {
    if (!parseAnswerResult) return Promise.reject('tool run error');

    const toolModule = toolModules.find((module) => module.moduleId === parseAnswerResult.name);
    if (!toolModule) return Promise.reject('tool not found');

    parseAnswerResult.toolName = toolModule.name;
    parseAnswerResult.toolAvatar = toolModule.avatar;

    // run tool flow
    const startParams = (() => {
      try {
        return json5.parse(parseAnswerResult.arguments);
      } catch (error) {
        return {};
      }
    })();

    // SSE response to client
    if (stream && detail) {
      responseWrite({
        res,
        event: SseResponseEventEnum.toolCall,
        data: JSON.stringify({
          tool: {
            id: parseAnswerResult.id,
            toolName: toolModule.name,
            toolAvatar: toolModule.avatar,
            functionName: parseAnswerResult.name,
            params: parseAnswerResult.arguments,
            response: ''
          }
        })
      });
    }

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

    if (stream && detail) {
      responseWrite({
        res,
        event: SseResponseEventEnum.toolResponse,
        data: JSON.stringify({
          tool: {
            id: parseAnswerResult.id,
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
      toolResponsePrompt: stringToolResponse
    };
  })();

  if (stream && detail) {
    responseWriteNodeStatus({
      res,
      name: module.name
    });
  }

  // 合并工具调用的结果，使用 functionCall 格式存储。
  const assistantToolMsgParams: ChatCompletionAssistantMessageParam = {
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    function_call: parseAnswerResult
  };
  const concatToolMessages = [
    ...filterMessages,
    assistantToolMsgParams
  ] as ChatCompletionMessageParam[];
  const tokens = await countGptMessagesTokens(concatToolMessages, undefined);
  const completeMessages: ChatCompletionMessageParam[] = [
    ...concatToolMessages,
    {
      role: ChatCompletionRequestMessageRoleEnum.Function,
      name: parseAnswerResult.name,
      content: toolsRunResponse.toolResponsePrompt
    }
  ];

  // tool assistant
  const toolAssistants = toolsRunResponse.moduleRunResponse.assistantResponses || [];
  // tool node assistant
  const adaptChatMessages = GPTMessages2Chats(completeMessages);
  const toolNodeAssistant = adaptChatMessages.pop() as AIChatItemType;

  const toolNodeAssistants = [...assistantResponses, ...toolAssistants, ...toolNodeAssistant.value];

  const dispatchFlowResponse = response
    ? response.dispatchFlowResponse.concat(toolsRunResponse.moduleRunResponse)
    : [toolsRunResponse.moduleRunResponse];

  // get the next user prompt
  lastMessage.content += `${answer}
TOOL_RESPONSE: """
${toolsRunResponse.toolResponsePrompt}
"""
ANSWER: `;

  /* check stop signal */
  const hasStopSignal = toolsRunResponse.moduleRunResponse.flowResponses.some(
    (item) => !!item.toolStop
  );
  if (hasStopSignal) {
    return {
      dispatchFlowResponse,
      totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
      completeMessages: filterMessages,
      assistantResponses: toolNodeAssistants
    };
  }

  return runToolWithPromptCall(
    {
      ...props,
      messages
    },
    {
      dispatchFlowResponse,
      totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
      assistantResponses: toolNodeAssistants
    }
  );
};

async function streamResponse({
  res,
  detail,
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

  let startResponseWrite = false;
  let textAnswer = '';

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      break;
    }

    const responseChoice = part.choices?.[0]?.delta;
    if (responseChoice.content) {
      const content = responseChoice?.content || '';
      textAnswer += content;

      if (startResponseWrite) {
        responseWrite({
          write,
          event: detail ? SseResponseEventEnum.answer : undefined,
          data: textAdaptGptResponse({
            text: content
          })
        });
      } else if (textAnswer.length >= 3) {
        textAnswer = textAnswer.trim();
        if (textAnswer.startsWith('0')) {
          startResponseWrite = true;
          // find first : index
          const firstIndex = textAnswer.indexOf(':');
          textAnswer = textAnswer.substring(firstIndex + 1).trim();
          responseWrite({
            write,
            event: detail ? SseResponseEventEnum.answer : undefined,
            data: textAdaptGptResponse({
              text: textAnswer
            })
          });
        }
      }
    }
  }

  if (!textAnswer) {
    return Promise.reject('LLM api response empty');
  }
  // console.log(textAnswer, '---===');
  return { answer: textAnswer.trim() };
}

const parseAnswer = (str: string): FunctionCallCompletion | string => {
  // 首先，使用正则表达式提取TOOL_ID和TOOL_ARGUMENTS
  const prefix = '1:';
  str = str.trim();
  if (str.startsWith(prefix)) {
    const toolString = str.substring(prefix.length).trim();

    try {
      const toolCall = json5.parse(toolString);
      return {
        id: getNanoid(),
        name: toolCall.toolId,
        arguments: JSON.stringify(toolCall.arguments || toolCall.parameters)
      };
    } catch (error) {
      return str;
    }
  } else {
    return str;
  }
};
