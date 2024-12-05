import { createChatCompletion } from '../../../../ai/config';
import { filterGPTMessageByMaxTokens, loadRequestMessages } from '../../../../chat/utils';
import {
  ChatCompletion,
  StreamChatType,
  ChatCompletionMessageParam,
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
import { countGptMessagesTokens } from '../../../../../common/string/tiktoken/index';
import {
  getNanoid,
  replaceVariable,
  sliceJsonStr,
  sliceStrStartEnd
} from '@fastgpt/global/common/string/tools';
import { AIChatItemType } from '@fastgpt/global/core/chat/type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { formatToolResponse, initToolCallEdges, initToolNodes } from './utils';
import { computedMaxToken, llmCompletionsBodyFormat } from '../../../../ai/utils';
import { WorkflowResponseType } from '../../type';
import { toolValueTypeList } from '@fastgpt/global/core/workflow/constants';
import { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';

type FunctionCallCompletion = {
  id: string;
  name: string;
  arguments: string;
  toolName?: string;
  toolAvatar?: string;
};

const ERROR_TEXT = 'Tool run error';
const INTERACTIVE_STOP_SIGNAL = 'INTERACTIVE_STOP_SIGNAL';

export const runToolWithPromptCall = async (
  props: DispatchToolModuleProps,
  response?: RunToolResponse
): Promise<RunToolResponse> => {
  const { messages, toolNodes, toolModel, interactiveEntryToolParams, ...workflowProps } = props;
  const {
    res,
    requestOrigin,
    runtimeNodes,
    runtimeEdges,
    user,
    stream,
    workflowStreamResponse,
    params: { temperature = 0, maxToken = 4000, aiChatVision }
  } = workflowProps;

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

    // Check interactive response(Only 1 interaction is reserved)
    const workflowInteractiveResponseItem = toolRunResponse?.workflowInteractiveResponse
      ? toolRunResponse
      : undefined;

    // Rewrite toolCall messages
    const concatMessages = [...messages.slice(0, -1), ...interactiveEntryToolParams.memoryMessages];
    const lastMessage = concatMessages[concatMessages.length - 1];
    lastMessage.content = workflowInteractiveResponseItem
      ? lastMessage.content
      : replaceVariable(lastMessage.content, {
          [INTERACTIVE_STOP_SIGNAL]: stringToolResponse
        });

    // Check stop signal
    const hasStopSignal = toolRunResponse.flowResponses.some((item) => !!item.toolStop);
    if (hasStopSignal || workflowInteractiveResponseItem) {
      // Get interactive tool data
      const workflowInteractiveResponse =
        workflowInteractiveResponseItem?.workflowInteractiveResponse;
      const toolWorkflowInteractiveResponse: WorkflowInteractiveResponseType | undefined =
        workflowInteractiveResponse
          ? {
              ...workflowInteractiveResponse,
              toolParams: {
                entryNodeIds: workflowInteractiveResponse.entryNodeIds,
                toolCallId: '',
                memoryMessages: [lastMessage]
              }
            }
          : undefined;

      return {
        dispatchFlowResponse: [toolRunResponse],
        toolNodeTokens: 0,
        completeMessages: concatMessages,
        assistantResponses: toolRunResponse.assistantResponses,
        runTimes: toolRunResponse.runTimes,
        toolWorkflowInteractiveResponse
      };
    }

    return runToolWithPromptCall(
      {
        ...props,
        interactiveEntryToolParams: undefined,
        messages: concatMessages
      },
      {
        dispatchFlowResponse: [toolRunResponse],
        toolNodeTokens: 0,
        assistantResponses: toolRunResponse.assistantResponses,
        runTimes: toolRunResponse.runTimes
      }
    );
  }

  const assistantResponses = response?.assistantResponses || [];

  const toolsPrompt = JSON.stringify(
    toolNodes.map((item) => {
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
        const jsonSchema = (
          toolValueTypeList.find((type) => type.value === item.valueType) || toolValueTypeList[0]
        ).jsonSchema;

        properties[item.key] = {
          ...jsonSchema,
          description: item.toolDescription || '',
          enum: item.enum?.split('\n').filter(Boolean) || []
        };
      });

      return {
        toolId: item.nodeId,
        description: item.intro,
        parameters: {
          type: 'object',
          properties,
          required: item.toolParams.filter((item) => item.required).map((item) => item.key)
        }
      };
    })
  );

  const lastMessage = messages[messages.length - 1];
  if (typeof lastMessage.content === 'string') {
    lastMessage.content = replaceVariable(lastMessage.content, {
      toolsPrompt
    });
  } else if (Array.isArray(lastMessage.content)) {
    // array, replace last element
    const lastText = lastMessage.content[lastMessage.content.length - 1];
    if (lastText.type === 'text') {
      lastText.text = replaceVariable(lastText.text, {
        toolsPrompt
      });
    } else {
      return Promise.reject('Prompt call invalid input');
    }
  } else {
    return Promise.reject('Prompt call invalid input');
  }

  const filterMessages = await filterGPTMessageByMaxTokens({
    messages,
    maxTokens: toolModel.maxContext - 500 // filter token. not response maxToken
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
      messages: requestMessages
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
    userKey: user.openaiAccount,
    options: {
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    }
  });

  const answer = await (async () => {
    if (res && isStreamResponse) {
      const { answer } = await streamResponse({
        res,
        toolNodes,
        stream: aiResponse,
        workflowStreamResponse
      });

      return answer;
    } else {
      const result = aiResponse as ChatCompletion;

      return result.choices?.[0]?.message?.content || '';
    }
  })();
  const { answer: replaceAnswer, toolJson } = parseAnswer(answer);
  if (!answer && !toolJson) {
    return Promise.reject(getEmptyResponseTip());
  }

  // No tools
  if (!toolJson) {
    if (replaceAnswer === ERROR_TEXT) {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: replaceAnswer
        })
      });
    }

    // 不支持 stream 模式的模型的流失响应
    if (stream && !isStreamResponse) {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.fastAnswer,
        data: textAdaptGptResponse({
          text: replaceAnswer
        })
      });
    }

    // No tool is invoked, indicating that the process is over
    const gptAssistantResponse: ChatCompletionAssistantMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: replaceAnswer
    };
    const completeMessages = filterMessages.concat(gptAssistantResponse);
    const tokens = await countGptMessagesTokens(completeMessages, undefined);
    // console.log(tokens, 'response token');

    // concat tool assistant
    const toolNodeAssistant = GPTMessages2Chats([gptAssistantResponse])[0] as AIChatItemType;

    return {
      dispatchFlowResponse: response?.dispatchFlowResponse || [],
      toolNodeTokens: response?.toolNodeTokens ? response.toolNodeTokens + tokens : tokens,
      completeMessages,
      assistantResponses: [...assistantResponses, ...toolNodeAssistant.value],
      runTimes: (response?.runTimes || 0) + 1
    };
  }

  // Run the selected tool.
  const toolsRunResponse = await (async () => {
    const toolNode = toolNodes.find((item) => item.nodeId === toolJson.name);
    if (!toolNode) return Promise.reject('tool not found');

    toolJson.toolName = toolNode.name;
    toolJson.toolAvatar = toolNode.avatar;

    // run tool flow
    const startParams = (() => {
      try {
        return json5.parse(toolJson.arguments);
      } catch (error) {
        return {};
      }
    })();

    // SSE response to client
    workflowStreamResponse?.({
      event: SseResponseEventEnum.toolCall,
      data: {
        tool: {
          id: toolJson.id,
          toolName: toolNode.name,
          toolAvatar: toolNode.avatar,
          functionName: toolJson.name,
          params: toolJson.arguments,
          response: ''
        }
      }
    });

    initToolNodes(runtimeNodes, [toolNode.nodeId], startParams);
    const toolResponse = await dispatchWorkFlow({
      ...workflowProps,
      isToolCall: true
    });

    const stringToolResponse = formatToolResponse(toolResponse.toolResponses);

    workflowStreamResponse?.({
      event: SseResponseEventEnum.toolResponse,
      data: {
        tool: {
          id: toolJson.id,
          toolName: '',
          toolAvatar: '',
          params: '',
          response: sliceStrStartEnd(stringToolResponse, 500, 500)
        }
      }
    });

    return {
      toolResponse,
      toolResponsePrompt: stringToolResponse
    };
  })();

  // 合并工具调用的结果，使用 functionCall 格式存储。
  const assistantToolMsgParams: ChatCompletionAssistantMessageParam = {
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    function_call: toolJson
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
  const tokens = await countGptMessagesTokens(concatToolMessages, undefined);

  /* 
    ...
    user
    assistant: tool data
    function: tool response
  */
  const functionResponseMessage: ChatCompletionMessageParam = {
    role: ChatCompletionRequestMessageRoleEnum.Function,
    name: toolJson.name,
    content: toolsRunResponse.toolResponsePrompt
  };

  // tool node assistant
  const toolNodeAssistant = GPTMessages2Chats([
    assistantToolMsgParams,
    functionResponseMessage
  ])[0] as AIChatItemType;
  const toolChildAssistants = toolsRunResponse.toolResponse.assistantResponses.filter(
    (item) => item.type !== ChatItemValueTypeEnum.interactive
  );
  const toolNodeAssistants = [
    ...assistantResponses,
    ...toolNodeAssistant.value,
    ...toolChildAssistants
  ];

  const dispatchFlowResponse = response
    ? [...response.dispatchFlowResponse, toolsRunResponse.toolResponse]
    : [toolsRunResponse.toolResponse];

  // Check interactive response(Only 1 interaction is reserved)
  const workflowInteractiveResponseItem = toolsRunResponse.toolResponse?.workflowInteractiveResponse
    ? toolsRunResponse.toolResponse
    : undefined;

  // get the next user prompt
  if (typeof lastMessage.content === 'string') {
    lastMessage.content += `${replaceAnswer}
TOOL_RESPONSE: """
${workflowInteractiveResponseItem ? `{{${INTERACTIVE_STOP_SIGNAL}}}` : toolsRunResponse.toolResponsePrompt}
"""
ANSWER: `;
  } else if (Array.isArray(lastMessage.content)) {
    // array, replace last element
    const lastText = lastMessage.content[lastMessage.content.length - 1];
    if (lastText.type === 'text') {
      lastText.text += `${replaceAnswer}
TOOL_RESPONSE: """
${workflowInteractiveResponseItem ? `{{${INTERACTIVE_STOP_SIGNAL}}}` : toolsRunResponse.toolResponsePrompt}
"""
ANSWER: `;
    } else {
      return Promise.reject('Prompt call invalid input');
    }
  } else {
    return Promise.reject('Prompt call invalid input');
  }

  const runTimes = (response?.runTimes || 0) + toolsRunResponse.toolResponse.runTimes;
  const toolNodeTokens = response?.toolNodeTokens ? response.toolNodeTokens + tokens : tokens;

  // Check stop signal
  const hasStopSignal = toolsRunResponse.toolResponse.flowResponses.some((item) => !!item.toolStop);

  if (hasStopSignal || workflowInteractiveResponseItem) {
    // Get interactive tool data
    const workflowInteractiveResponse =
      workflowInteractiveResponseItem?.workflowInteractiveResponse;
    const toolWorkflowInteractiveResponse: WorkflowInteractiveResponseType | undefined =
      workflowInteractiveResponse
        ? {
            ...workflowInteractiveResponse,
            toolParams: {
              entryNodeIds: workflowInteractiveResponse.entryNodeIds,
              toolCallId: '',
              memoryMessages: [lastMessage]
            }
          }
        : undefined;

    return {
      dispatchFlowResponse,
      toolNodeTokens,
      completeMessages: filterMessages,
      assistantResponses: toolNodeAssistants,
      runTimes,
      toolWorkflowInteractiveResponse
    };
  }

  return runToolWithPromptCall(
    {
      ...props,
      messages
    },
    {
      dispatchFlowResponse,
      toolNodeTokens,
      assistantResponses: toolNodeAssistants,
      runTimes
    }
  );
};

async function streamResponse({
  res,
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

  let startResponseWrite = false;
  let textAnswer = '';

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      break;
    }

    const responseChoice = part.choices?.[0]?.delta;
    // console.log(responseChoice, '---===');

    if (responseChoice?.content) {
      const content = responseChoice?.content || '';
      textAnswer += content;

      if (startResponseWrite) {
        workflowStreamResponse?.({
          write,
          event: SseResponseEventEnum.answer,
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
          workflowStreamResponse?.({
            write,
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({
              text: textAnswer
            })
          });
        }
      }
    }
  }

  return { answer: textAnswer.trim() };
}

const parseAnswer = (
  str: string
): {
  answer: string;
  toolJson?: FunctionCallCompletion;
} => {
  str = str.trim();
  // 首先，使用正则表达式提取TOOL_ID和TOOL_ARGUMENTS
  const prefixReg = /^1(:|：)/;
  const answerPrefixReg = /^0(:|：)/;

  if (prefixReg.test(str)) {
    const toolString = sliceJsonStr(str);

    try {
      const toolCall = json5.parse(toolString);
      return {
        answer: `1: ${toolString}`,
        toolJson: {
          id: getNanoid(),
          name: toolCall.toolId,
          arguments: JSON.stringify(toolCall.arguments || toolCall.parameters)
        }
      };
    } catch (error) {
      return {
        answer: ERROR_TEXT
      };
    }
  } else {
    return {
      answer: str.replace(answerPrefixReg, '')
    };
  }
};
