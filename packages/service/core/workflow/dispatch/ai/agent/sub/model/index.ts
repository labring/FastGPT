import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { createLLMResponse, type ResponseEvents } from '../../../../../../ai/llm/request';
import { getLLMModel } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getErrText } from '@fastgpt/global/common/error/utils';

type ModelAgentConfig = {
  model: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type DispatchModelAgentProps = ModelAgentConfig & {
  systemPrompt: string;
  task: string;
  onReasoning: ResponseEvents['onReasoning'];
  onStreaming: ResponseEvents['onStreaming'];
};

type DispatchModelAgentResponse = {
  response: string;
  usages: ChatNodeUsageType[];
  nodeResponse: Omit<ChatHistoryItemResType, 'id' | 'nodeId' | 'runningTime'>;
};

/**
 * 执行一个轻量级模型子任务。
 * 该函数不参与 agent loop，只负责按给定 systemPrompt/task 调一次 LLM 并返回文本和 usage。
 */
export async function dispatchModelAgent({
  model,
  temperature,
  top_p,
  stream,
  systemPrompt,
  task,
  onReasoning,
  onStreaming
}: DispatchModelAgentProps): Promise<DispatchModelAgentResponse> {
  const modelData = getLLMModel(model);

  const messages: ChatCompletionMessageParam[] = [
    ...(systemPrompt
      ? [
          {
            role: 'system' as const,
            content: systemPrompt
          }
        ]
      : []),
    {
      role: 'user',
      content: task
    }
  ];

  const { answerText, usage, requestId, error } = await createLLMResponse({
    throwError: false,
    body: {
      model: modelData.model,
      temperature,
      messages: messages,
      top_p,
      stream
    },
    onReasoning,
    onStreaming
  });

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelData.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });
  const usageItem = {
    moduleName: modelName,
    model: modelData.model,
    totalPoints,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  };

  return {
    response: answerText,
    usages: [usageItem],
    nodeResponse: {
      moduleType: FlowNodeTypeEnum.agent,
      moduleName: modelName,
      model: modelData.model,
      llmRequestIds: [requestId],
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalPoints,
      textOutput: answerText,
      ...(error ? { errorText: getErrText(error) } : {})
    }
  };
}
