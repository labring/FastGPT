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

export const dispatchTopAgent = async (
  props: HelperBotDispatchParamsType
): Promise<HelperBotDispatchResponseType> => {
  const { query, files, metadata, histories, workflowResponseWrite, user } = props;

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
  const systemPrompt = getPrompt({ resourceList });

  const historyMessages = helperChats2GPTMessages({
    messages: histories,
    reserveTool: false
  });
  const conversationMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...historyMessages,
    { role: 'user' as const, content: query }
  ];

  // console.log('📝 TopAgent 阶段 1: 信息收集');
  // console.log('conversationMessages:', conversationMessages);

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

  /* 
    3 种返回情况
      1. 「信息收集已完成」
      2. JSON 字符串：{ reasoning?: string; question?: string }
      3. 配置表单
  */
  const firstPhaseAnswer = llmResponse.answerText;
  const firstPhaseReasoning = llmResponse.reasoningText;

  // 尝试解析信息收集阶段的 JSON 响应
  let parsedResponse: { reasoning?: string; question?: string } | null = null;
  try {
    parsedResponse = JSON.parse(firstPhaseAnswer);
  } catch (e) {
    // 如果解析失败,说明不是 JSON 格式,可能是普通文本
    parsedResponse = null;
  }

  if (firstPhaseAnswer.includes('「信息收集已完成」')) {
    addLog.debug('🔄 TopAgent: 检测到信息收集完成信号，切换到计划生成阶段');

    const newMessages = [
      ...conversationMessages,
      { role: 'assistant' as const, content: firstPhaseAnswer },
      { role: 'user' as const, content: '请你直接生成规划方案' }
    ];

    const planResponse = await createLLMResponse({
      body: {
        messages: newMessages,
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
    usage.inputTokens = planResponse.usage.inputTokens;
    usage.outputTokens = planResponse.usage.outputTokens;

    try {
      const planJson = JSON.parse(planResponse.answerText);

      const formData = TopAgentFormDataSchema.parse({
        role: planJson.task_analysis?.role,
        taskObject: planJson.task_analysis?.goal,
        tools: planJson.resources?.tools?.map((tool: any) => tool.id),
        fileUploadEnabled: planJson.resources?.system_features?.file_upload?.enabled || false
      });

      // Send formData if exists
      if (formData) {
        workflowResponseWrite?.({
          event: SseResponseEventEnum.formData,
          data: formData
        });
      }
    } catch (e) {
      addLog.warn(`[Top agent] parse answer faield`, { text: planResponse.answerText });
    }

    return {
      aiResponse: formatAIResponse({
        text: planResponse.answerText,
        reasoning: planResponse.reasoningText
      }),
      usage
    };
  }

  const displayText = parsedResponse?.question || firstPhaseAnswer;
  return {
    aiResponse: formatAIResponse({ text: displayText, reasoning: firstPhaseReasoning }),
    usage
  };
};
