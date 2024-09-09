import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '../../../../ai/config';
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
import { updateToolInputValue } from './utils';
import { computedMaxToken, computedTemperature } from '../../../../ai/utils';
import { WorkflowResponseType } from '../../type';

type FunctionCallCompletion = {
  id: string;
  name: string;
  arguments: string;
  toolName?: string;
  toolAvatar?: string;
};

const ERROR_TEXT = 'Tool run error';

export const runToolWithPromptCall = async (
  props: DispatchToolModuleProps & {
    messages: ChatCompletionMessageParam[];
    toolNodes: ToolNodeItemType[];
    toolModel: LLMModelItemType;
  },
  response?: RunToolResponse
): Promise<RunToolResponse> => {
  const {
    toolModel,
    toolNodes,
    messages,
    res,
    requestOrigin,
    runtimeNodes,
    node,
    stream,
    workflowStreamResponse,
    params: { temperature = 0, maxToken = 4000, aiChatVision }
  } = props;
  const assistantResponses = response?.assistantResponses || [];

  const toolsPrompt = JSON.stringify(
    toolNodes.map((item) => {
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
          type: 'string',
          description: item.toolDescription || ''
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
  if (typeof lastMessage.content !== 'string') {
    return Promise.reject('Prompt call invalid input');
  }
  lastMessage.content = replaceVariable(lastMessage.content, {
    toolsPrompt
  });

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
  const requestBody = {
    ...toolModel?.defaultConfig,
    model: toolModel.model,
    temperature: computedTemperature({
      model: toolModel,
      temperature
    }),
    max_tokens,
    stream,
    messages: requestMessages
  };

  // console.log(JSON.stringify(requestBody, null, 2));
  /* Run llm */
  const ai = getAIApi({
    timeout: 480000
  });
  const aiResponse = await ai.chat.completions.create(requestBody, {
    headers: {
      Accept: 'application/json, text/plain, */*'
    }
  });

  const answer = await (async () => {
    if (res && stream) {
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
      totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
      completeMessages,
      assistantResponses: [...assistantResponses, ...toolNodeAssistant.value]
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

    const moduleRunResponse = await dispatchWorkFlow({
      ...props,
      isToolCall: true,
      runtimeNodes: runtimeNodes.map((item) =>
        item.nodeId === toolNode.nodeId
          ? {
              ...item,
              isEntry: true,
              inputs: updateToolInputValue({ params: startParams, inputs: item.inputs })
            }
          : item
      )
    });

    const stringToolResponse = (() => {
      if (typeof moduleRunResponse.toolResponses === 'object') {
        return JSON.stringify(moduleRunResponse.toolResponses, null, 2);
      }

      return moduleRunResponse.toolResponses ? String(moduleRunResponse.toolResponses) : 'none';
    })();

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
      moduleRunResponse,
      toolResponsePrompt: stringToolResponse
    };
  })();

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

  // 合并工具调用的结果，使用 functionCall 格式存储。
  const assistantToolMsgParams: ChatCompletionAssistantMessageParam = {
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    function_call: toolJson
  };
  const concatToolMessages = [
    ...requestMessages,
    assistantToolMsgParams
  ] as ChatCompletionMessageParam[];
  const tokens = await countGptMessagesTokens(concatToolMessages, undefined);
  const completeMessages: ChatCompletionMessageParam[] = [
    ...concatToolMessages,
    {
      role: ChatCompletionRequestMessageRoleEnum.Function,
      name: toolJson.name,
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
  lastMessage.content += `${replaceAnswer}
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

  if (!textAnswer) {
    return Promise.reject('LLM api response empty');
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
