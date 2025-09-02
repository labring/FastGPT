import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '../../../../../../common/system/log';
import { createLLMResponse, type ResponseEvents } from '../../../../../ai/llm/request';
import { defaultGeneratePlanPrompt } from './prompt';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';

type PlanAgentToolArgs = {
  instruction?: string;
};

type PlanAgentConfig = {
  model: string;
  customSystemPrompt?: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type transferPlanAgentProps = {
  sharedContext: ChatCompletionMessageParam[];
  toolArgs: PlanAgentToolArgs;
} & PlanAgentConfig &
  Pick<ResponseEvents, 'onStreaming' | 'onReasoning'>;

export async function transferPlanAgent({
  toolArgs,
  sharedContext,
  onStreaming,
  onReasoning,

  model,
  customSystemPrompt,
  temperature = 0,
  top_p,
  stream = true
}: transferPlanAgentProps): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const { instruction } = toolArgs;

  try {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: customSystemPrompt || defaultGeneratePlanPrompt
      },
      ...sharedContext.filter((item) => item.role !== 'system'),
      {
        role: 'user',
        content: instruction ?? ''
      }
    ];

    const {
      answerText,
      usage: { inputTokens, outputTokens }
    } = await createLLMResponse({
      body: {
        model,
        temperature,
        messages,
        top_p,
        stream
      },
      onStreaming,
      onReasoning
    });

    return {
      content: answerText,
      inputTokens,
      outputTokens
    };
  } catch (error) {
    addLog.warn('call plan_agent failed');
    return {
      content: '',
      inputTokens: 0,
      outputTokens: 0
    };
  }
}
