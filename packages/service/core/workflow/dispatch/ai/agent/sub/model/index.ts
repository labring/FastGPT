import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '../../../../../../../common/system/log';
import { createLLMResponse, type ResponseEvents } from '../../../../../../ai/llm/request';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { chats2GPTMessages, getSystemPrompt_ChatItemType } from '@fastgpt/global/core/chat/adapt';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { DispatchSubAppProps, DispatchSubAppResponse } from '../../type';

type ModelAgentConfig = {
  model: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  systemPrompt?: string;
  task?: string;
};

type dispatchModelAgentProps = DispatchSubAppProps<ModelAgentConfig>;

export async function dispatchModelAgent({
  messages,
  onStream,
  params
}: dispatchModelAgentProps): Promise<DispatchSubAppResponse> {
  const { model, temperature, top_p, stream, systemPrompt, task } = params;

  try {
    const context: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt ?? ''
      },
      {
        role: 'user',
        content: task ?? ''
      }
    ];

    const {
      answerText,
      usage: { inputTokens, outputTokens }
    } = await createLLMResponse({
      body: {
        model,
        temperature,
        messages: context,
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
    addLog.warn('call model_agent failed');
    return {
      response: err,
      usages: undefined
    };
  }
}
