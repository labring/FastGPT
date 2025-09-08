import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '../../../../../../../common/system/log';
import { createLLMResponse, type ResponseEvents } from '../../../../../../ai/llm/request';
import { defaultPlanAgentPrompt } from './prompt';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { DispatchSubAppProps, DispatchSubAppResponse } from '../../type';

type PlanAgentConfig = {
  model: string;
  customSystemPrompt?: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  instruction?: string;
};

type dispatchPlanAgentProps = DispatchSubAppProps<PlanAgentConfig>;

export const dispatchPlanAgent = async ({
  messages,
  onStream,
  params
}: dispatchPlanAgentProps): Promise<DispatchSubAppResponse> => {
  const { model, customSystemPrompt, temperature, top_p, stream, instruction } = params;

  try {
    const combinedMessages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: replaceVariable(defaultPlanAgentPrompt, {
          userRole: customSystemPrompt
        })
      },
      ...messages,
      { role: 'user', content: instruction ?? '' }
    ];

    const {
      answerText,
      usage: { inputTokens, outputTokens }
    } = await createLLMResponse({
      body: {
        model,
        temperature,
        messages: combinedMessages,
        top_p,
        stream
      },
      onStreaming: onStream
    });

    return {
      response: answerText,
      usages: undefined
    };
  } catch (error) {
    const err = getErrText(error);
    addLog.warn('call plan_agent failed');
    return {
      response: err,
      usages: undefined
    };
  }
};
