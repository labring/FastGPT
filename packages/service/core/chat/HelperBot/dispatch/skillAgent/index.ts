import type { HelperBotDispatchParamsType, HelperBotDispatchResponseType } from '../type';
import { helperChats2GPTMessages } from '@fastgpt/global/core/chat/helperBot/adaptor';
import { getPrompt } from './prompt';
import { createLLMResponse } from '../../../../ai/llm/request';
import { getLLMModel } from '../../../../ai/model';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { generateResourceList } from '../topAgent/utils';
import { addLog } from '../../../../../common/system/log';
import { formatAIResponse } from '../utils';
import {
  type SkillAgentParamsType,
  type GeneratedSkillType,
  GeneratedSkillResultSchema
} from '@fastgpt/global/core/chat/helperBot/skillAgent/type';
import { parseJsonArgs } from '../../../../ai/utils';
import type {
  UserInputFormItemType,
  UserInputInteractive
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export const dispatchSkillAgent = async (
  props: HelperBotDispatchParamsType<SkillAgentParamsType>
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

  // console.dir(conversationMessages, { depth: null });
  // Single LLM call - LLM self-determines phase and outputs corresponding format
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

  // Parse JSON response
  try {
    const responseJson = parseJsonArgs<GeneratedSkillType>(answerText);

    if (!responseJson) {
      addLog.warn(`[Skill agent] Failed to parse JSON response`, { text: answerText });
      throw new Error('Failed to parse JSON response');
    }
    console.log(JSON.stringify(responseJson, null, 2));
    // Handle based on phase field
    if (responseJson.phase === 'generation') {
      addLog.debug('🔄 SkillAgent: Generated skill generation phase');
      const parseResult = GeneratedSkillResultSchema.safeParse(responseJson).data;

      if (!parseResult) {
        addLog.warn(`[Skill agent] Failed to parse JSON response`, { responseJson });
        throw new Error('Failed to parse JSON response');
      }

      // Send generatedSkill event
      workflowResponseWrite?.({
        event: SseResponseEventEnum.generatedSkill,
        data: parseResult
      });

      // Return original format (backward compatible)
      return {
        aiResponse: formatAIResponse({
          text: answerText,
          reasoning: reasoningText
        }),
        usage
      };
    } else if (responseJson.phase === 'collection') {
      addLog.debug('📝 SkillAgent: Information collection phase');

      // 检查是否有表单数据
      const formData = responseJson.form;
      if (formData) {
        // 转换为前端可用的表单格式
        const inputForm: UserInputInteractive = {
          type: 'userInput',
          params: {
            inputForm: formData.map((item) => {
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

        // 发送表单事件
        workflowResponseWrite?.({
          event: SseResponseEventEnum.collectionForm,
          data: inputForm
        });

        return {
          aiResponse: formatAIResponse({
            text: responseJson.question,
            reasoning: responseJson.reasoning || reasoningText,
            collectionForm: inputForm
          }),
          usage
        };
      }

      // 无表单，纯文本问题
      workflowResponseWrite?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({ text: responseJson.question })
      });

      return {
        aiResponse: formatAIResponse({
          text: responseJson.question,
          reasoning: responseJson.reasoning || reasoningText
        }),
        usage
      };
    } else {
      // Unknown phase
      addLog.warn(`[Skill agent] Unknown phase`, responseJson);
      return {
        aiResponse: formatAIResponse({
          text: answerText,
          reasoning: reasoningText
        }),
        usage
      };
    }
  } catch (e) {
    // JSON parse failed - return original text
    addLog.warn(`[Skill agent] Failed to parse JSON response`, { text: answerText });
    return {
      aiResponse: formatAIResponse({
        text: answerText,
        reasoning: reasoningText
      }),
      usage
    };
  }
};
