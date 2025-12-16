import type { HelperBotDispatchParamsType, HelperBotDispatchResponseType } from '../type';
import { helperChats2GPTMessages } from '@fastgpt/global/core/chat/helperBot/adaptor';
import { getPrompt } from './prompt';
import { createLLMResponse } from '../../../../ai/llm/request';
import { getLLMModel } from '../../../../ai/model';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { generateResourceList } from './utils';
import { TopAgentFormDataSchema } from './type';
import { addLog } from '../../../../../common/system/log';
import { formatAIResponse } from '../utils';
import type { TopAgentParamsType } from '@fastgpt/global/core/chat/helperBot/topAgent/type';

export const dispatchTopAgent = async (
  props: HelperBotDispatchParamsType<TopAgentParamsType>
): Promise<HelperBotDispatchResponseType> => {
  const { query, files, data, histories, workflowResponseWrite, user } = props;

  const modelData = getLLMModel();
  if (!modelData) {
    return Promise.reject('Can not get model data');
  }

  const usage = {
    model: modelData.model,
    inputTokens: 0,
    outputTokens: 0
  };

  const resourceList = await generateResourceList({
    teamId: user.teamId,
    isRoot: user.isRoot
  });
  const systemPrompt = getPrompt({
    resourceList,
    metadata: data
  });

  const historyMessages = helperChats2GPTMessages({
    messages: histories,
    reserveTool: false
  });
  const conversationMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...historyMessages,
    { role: 'user' as const, content: query }
  ];

  const llmResponse = await createLLMResponse({
    body: {
      messages: conversationMessages,
      model: modelData,
      stream: true
    },
    onStreaming: ({ text }) => {
      workflowResponseWrite?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({ text })
      });
    },
    onReasoning: ({ text }) => {
      workflowResponseWrite?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({ reasoning_content: text })
      });
    }
  });

  usage.inputTokens = llmResponse.usage.inputTokens;
  usage.outputTokens = llmResponse.usage.outputTokens;

  const answerText = llmResponse.answerText;
  const reasoningText = llmResponse.reasoningText;

  try {
    const responseJson = JSON.parse(answerText);

    if (responseJson.phase === 'generation') {
      addLog.debug('🔄 TopAgent: Configuration generation phase');

      const formData = TopAgentFormDataSchema.parse({
        role: responseJson.task_analysis?.role,
        taskObject: responseJson.task_analysis?.goal,
        tools: responseJson.resources?.tools?.map((tool: any) => tool.id),
        fileUploadEnabled: responseJson.resources?.system_features?.file_upload?.enabled || false
      });

      if (formData) {
        workflowResponseWrite?.({
          event: SseResponseEventEnum.formData,
          data: formData
        });
      }

      return {
        aiResponse: formatAIResponse({
          text: answerText,
          reasoning: reasoningText
        }),
        usage
      };
    } else if (responseJson.phase === 'collection') {
      addLog.debug('📝 TopAgent: Information collection phase');

      const displayText = responseJson.question || answerText;
      return {
        aiResponse: formatAIResponse({
          text: displayText,
          reasoning: responseJson.reasoning || reasoningText
        }),
        usage
      };
    } else {
      addLog.warn(`[Top agent] Unknown phase: ${responseJson.phase}`);
      return {
        aiResponse: formatAIResponse({
          text: answerText,
          reasoning: reasoningText
        }),
        usage
      };
    }
  } catch (e) {
    addLog.warn(`[Top agent] Failed to parse JSON response`, { text: answerText });
    return {
      aiResponse: formatAIResponse({
        text: answerText,
        reasoning: reasoningText
      }),
      usage
    };
  }
};
