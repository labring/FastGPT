import type { HelperBotDispatchParamsType, HelperBotDispatchResponseType } from '../type';
import { helperChats2GPTMessages } from '@fastgpt/global/core/chat/helperBot/adaptor';
import { getPrompt } from './prompt';
import { createLLMResponse } from '../../../../ai/llm/request';
import { getLLMModel } from '../../../../ai/model';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/helperBot/type';
import { getSystemToolsWithInstalled } from '../../../../app/tool/controller';

export const dispatchTopAgent = async (
  props: HelperBotDispatchParamsType
): Promise<HelperBotDispatchResponseType> => {
  const { query, files, metadata, histories, workflowResponseWrite, teamId, userId } = props;

  const modelConfig = metadata.data?.modelConfig;

  const modelName = modelConfig?.model || global.systemDefaultModel?.llm?.model;
  if (!modelName) {
    throw new Error('未配置 LLM 模型，请在前端选择模型或在系统中配置默认模型');
  }
  const modelData = getLLMModel(modelName);
  if (!modelData) {
    throw new Error(`模型 ${modelName} 未找到`);
  }

  const temperature = modelConfig?.temperature ?? 0.7;
  const maxToken = modelConfig?.maxToken ?? 4000;
  const stream = modelConfig?.stream ?? true;

  const resourceList = await generateResourceList({
    teamId,
    userId
  });

  const historyMessages = helperChats2GPTMessages({
    messages: histories,
    reserveTool: false
  });

  const systemPrompt = getPrompt({ resourceList });
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
      model: modelName,
      temperature,
      stream,
      max_tokens: maxToken
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
    console.log('🔄 TopAgent: 检测到信息收集完成信号，切换到计划生成阶段');

    const newMessages = [
      ...conversationMessages,
      { role: 'assistant' as const, content: firstPhaseAnswer },
      { role: 'user' as const, content: '请你直接生成规划方案' }
    ];

    // console.log('📋 TopAgent 阶段 2: 计划生成');

    const planResponse = await createLLMResponse({
      body: {
        messages: newMessages,
        model: modelName,
        temperature,
        stream,
        max_tokens: maxToken
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

    let formData;
    try {
      const planJson = JSON.parse(planResponse.answerText);
      // console.log('解析的计划 JSON:', planJson);

      formData = {
        role: planJson.task_analysis?.role || '',
        taskObject: planJson.task_analysis?.goal || '',
        tools: planJson.resources?.tools?.map((tool: any) => tool.id) || [],
        fileUploadEnabled: planJson.resources?.system_features?.file_upload?.enabled || false
      };
    } catch (e) {
      console.error('解析计划 JSON 失败:', e);
    }

    return {
      aiResponse: formatAIResponse(planResponse.answerText, planResponse.reasoningText),
      formData
    };
  }

  const displayText = parsedResponse?.question || firstPhaseAnswer;
  return {
    aiResponse: formatAIResponse(displayText, firstPhaseReasoning)
  };
};

const generateResourceList = async ({
  teamId,
  userId
}: {
  teamId: string;
  userId: string;
}): Promise<string> => {
  let result = '\n## 可用资源列表\n';

  const tools = await getSystemToolsWithInstalled({
    teamId,
    isRoot: true // TODO: 需要传入实际的 isRoot 值
  });

  const installedTools = tools.filter((tool) => {
    return tool.installed && !tool.isFolder;
  });

  if (installedTools.length > 0) {
    result += '### 工具\n';
    installedTools.forEach((tool) => {
      const toolId = tool.id;
      const name =
        typeof tool.name === 'string'
          ? tool.name
          : tool.name?.en || tool.name?.['zh-CN'] || '未命名';
      const intro =
        typeof tool.intro === 'string' ? tool.intro : tool.intro?.en || tool.intro?.['zh-CN'] || '';
      const description = tool.toolDescription || intro || '暂无描述';
      result += `- **${toolId}** [工具]: ${name} - ${description}\n`;
    });
  } else {
    result += '### 工具\n暂无已安装的工具\n';
  }

  // TODO: 知识库
  result += '\n### 知识库\n暂未配置知识库\n';

  result += '\n### 系统功能\n';
  result += '- **file_upload**: 文件上传功能 (enabled, purpose, file_types)\n';

  return result;
};

const formatAIResponse = (text: string, reasoning?: string): AIChatItemValueItemType[] => {
  const result: AIChatItemValueItemType[] = [];

  if (reasoning) {
    result.push({
      reasoning: {
        content: reasoning
      }
    });
  }

  result.push({
    text: {
      content: text
    }
  });

  return result;
};
