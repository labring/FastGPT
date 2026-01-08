import { type HelperBotDispatchParamsType, type HelperBotDispatchResponseType } from '../type';
import { helperChats2GPTMessages } from '@fastgpt/global/core/chat/helperBot/adaptor';
import { getPrompt } from './prompt';
import { createLLMResponse } from '../../../../ai/llm/request';
import { getLLMModel } from '../../../../ai/model';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import {
  generateResourceList,
  extractResourcesFromPlan,
  buildSystemPrompt,
  buildDisplayText
} from './utils';
import { TopAgentAnswerSchema, TopAgentFormDataSchema } from './type';
import { addLog } from '../../../../../common/system/log';
import { formatAIResponse } from '../utils';
import type { TopAgentParamsType } from '@fastgpt/global/core/chat/helperBot/topAgent/type';
import type {
  UserInputFormItemType,
  UserInputInteractive
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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
    messages: histories
  });
  const conversationMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...historyMessages,
    { role: 'user' as const, content: query }
  ];
  console.log(JSON.stringify(conversationMessages, null, 2));
  const llmResponse = await createLLMResponse({
    body: {
      messages: conversationMessages,
      model: modelData,
      stream: true
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
  console.log('Top agent response:', answerText);
  try {
    const responseJson = TopAgentAnswerSchema.parse(JSON.parse(answerText));

    if (responseJson.phase === 'generation') {
      addLog.debug('🔄 TopAgent: Configuration generation phase');

      const { tools, knowledges } = extractResourcesFromPlan(responseJson.execution_plan);

      const formData = TopAgentFormDataSchema.parse({
        systemPrompt: buildSystemPrompt(responseJson), // 构建 system prompt
        tools, // 从 execution_plan 提取
        knowledges, // 从 execution_plan 提取
        fileUploadEnabled: responseJson.resources?.system_features?.file_upload?.enabled || false,
        executionPlan: responseJson.execution_plan // 保存原始 execution_plan
      });

      if (formData) {
        workflowResponseWrite?.({
          event: SseResponseEventEnum.topAgentConfig,
          data: formData
        });
      }

      return {
        aiResponse: formatAIResponse({
          text: buildDisplayText(responseJson), // 构建显示文本
          reasoning: reasoningText
        }),
        usage
      };
    } else if (responseJson.phase === 'collection') {
      addLog.debug('📝 TopAgent: Information collection phase');

      const formDeata = responseJson.form;
      if (formDeata) {
        const inputForm: UserInputInteractive = {
          type: 'userInput',
          params: {
            inputForm: formDeata.map((item) => {
              return {
                type: item.type as FlowNodeInputTypeEnum,
                key: getNanoid(6),
                label: item.label,
                value: '',
                required: false,
                valueType:
                  item.type === FlowNodeInputTypeEnum.numberInput
                    ? WorkflowIOValueTypeEnum.number
                    : WorkflowIOValueTypeEnum.string,
                list:
                  'options' in item
                    ? item.options?.map((option) => ({ label: option, value: option }))
                    : undefined
              };
            }),
            description: responseJson.question
          }
        };
        workflowResponseWrite?.({
          event: SseResponseEventEnum.collectionForm,
          data: inputForm
        });

        return {
          aiResponse: formatAIResponse({
            text: responseJson.question,
            reasoning: reasoningText,
            collectionForm: inputForm
          }),
          usage
        };
      }

      workflowResponseWrite?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({ text: responseJson.question })
      });

      return {
        aiResponse: formatAIResponse({
          text: responseJson.question,
          reasoning: reasoningText
        }),
        usage
      };
    } else {
      addLog.warn(`[Top agent] Unknown phase`, responseJson);
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
