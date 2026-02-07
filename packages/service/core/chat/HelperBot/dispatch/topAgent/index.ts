import { type HelperBotDispatchParamsType, type HelperBotDispatchResponseType } from '../type';
import { helperChats2GPTMessages } from '@fastgpt/global/core/chat/helperBot/adaptor';
import { getPrompt } from './prompt';
import { createLLMResponse } from '../../../../ai/llm/request';
import { getDefaultHelperBotModel } from '../../../../ai/model';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import {
  generateResourceList,
  extractResourcesFromPlan,
  buildSystemPrompt,
  buildDisplayText,
  getKnowledgeDatasetDetails
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
import { parseJsonArgs } from '../../../../ai/utils';

export const dispatchTopAgent = async (
  props: HelperBotDispatchParamsType<TopAgentParamsType>
): Promise<HelperBotDispatchResponseType> => {
  const { query, files, data, histories, workflowResponseWrite, user } = props;

  const modelData = getDefaultHelperBotModel();
  if (!modelData) {
    return Promise.reject('Can not get model data');
  }

  const usage = {
    model: modelData.model,
    inputTokens: 0,
    outputTokens: 0
  };

  const { resourceList, presetKnowledgeInfo } = await generateResourceList({
    teamId: user.teamId,
    tmbId: user.tmbId,
    isRoot: user.isRoot,
    lang: user.lang,
    metadata: data
  });
  const systemPrompt = getPrompt({
    resourceList,
    metadata: data,
    presetKnowledgeInfo
  });

  const historyMessages = helperChats2GPTMessages({
    messages: histories
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
    onReasoning: ({ text }) => {
      workflowResponseWrite?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({ reasoning_content: text })
      });
    }
    // onStreaming: ({ text }) => {
    //   workflowResponseWrite?.({
    //     event: SseResponseEventEnum.answer,
    //     data: textAdaptGptResponse({ text })
    //   });
    // }
  });

  usage.inputTokens = llmResponse.usage.inputTokens;
  usage.outputTokens = llmResponse.usage.outputTokens;

  const answerText = llmResponse.answerText;
  const reasoningText = llmResponse.reasoningText;
  console.log('Top agent response:', answerText);
  try {
    const parseAnswer = (text: string) => {
      return TopAgentAnswerSchema.safeParseAsync(parseJsonArgs(text));
    };
    let result = await parseAnswer(answerText);

    if (!result.success) {
      addLog.warn('[Top agent] JSON parse failed, try repair', { text: answerText });

      const repairSystemPrompt = `${systemPrompt}
        <json_repair>
        Return ONLY valid JSON. Do not include code fences or extra text.
        Convert the previous assistant output into the required JSON format.
        If information is insufficient, output a collection JSON with the most critical question.
        </json_repair>`;
      const repairResponse = await createLLMResponse({
        body: {
          messages: [
            { role: 'system' as const, content: repairSystemPrompt },
            ...historyMessages,
            {
              role: 'user' as const,
              content: `Previous assistant output:\n${answerText}`
            }
          ],
          model: modelData,
          stream: true
        }
      });
      usage.inputTokens += repairResponse.usage.inputTokens;
      usage.outputTokens += repairResponse.usage.outputTokens;

      result = await parseAnswer(repairResponse.answerText);
      if (!result.success) {
        addLog.warn('[Top agent] JSON repair failed', { text: repairResponse.answerText });
        return {
          aiResponse: formatAIResponse({
            text: answerText,
            reasoning: reasoningText
          }),
          usage
        };
      }
    }

    const responseJson = result.data;

    if (responseJson.phase === 'generation') {
      addLog.debug('🔄 TopAgent: Configuration generation phase');

      const { tools, knowledges } = extractResourcesFromPlan(responseJson.execution_plan);
      const knowledgesDetail = await getKnowledgeDatasetDetails({
        teamId: user.teamId,
        tmbId: user.tmbId,
        isRoot: user.isRoot,
        datasetIds: knowledges
      });
      const formData = TopAgentFormDataSchema.parse({
        systemPrompt: buildSystemPrompt(responseJson), // 构建 system prompt
        tools, // 从 execution_plan 提取
        knowledges: knowledgesDetail.map((item) => item.datasetId),
        knowledgesDetail,
        fileUploadEnabled: responseJson.resources?.system_features?.file_upload?.enabled || false,
        executionPlan: responseJson.execution_plan // 保存原始 execution_plan
      });

      if (formData) {
        workflowResponseWrite?.({
          event: SseResponseEventEnum.topAgentConfig,
          data: formData
        });
      }

      workflowResponseWrite?.({
        event: SseResponseEventEnum.plan,
        data: {
          type: 'generation'
        }
      });

      return {
        aiResponse: formatAIResponse({
          text: buildDisplayText(responseJson), // 构建显示文本
          reasoning: reasoningText,
          planHint: {
            type: 'generation'
          }
        }),
        usage
      };
    } else {
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
