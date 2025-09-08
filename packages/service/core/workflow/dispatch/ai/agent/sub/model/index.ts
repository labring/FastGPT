import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '../../../../../../../common/system/log';
import { createLLMResponse, type ResponseEvents } from '../../../../../../ai/llm/request';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { chats2GPTMessages, getSystemPrompt_ChatItemType } from '@fastgpt/global/core/chat/adapt';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';

type ModelAgentConfig = {
  model: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type transferModelAgentProps = {
  systemPrompt?: string;
  task?: string;
} & ModelAgentConfig &
  Pick<ResponseEvents, 'onStreaming' | 'onReasoning'>;

export async function transferModelAgent({
  systemPrompt = '',
  task = '',

  onStreaming,
  onReasoning,

  model,
  temperature = 0.7,
  top_p,
  stream = true
}: transferModelAgentProps): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number;
}> {
  try {
    const messages: ChatItemType[] = [
      ...getSystemPrompt_ChatItemType(systemPrompt),
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            type: ChatItemValueTypeEnum.text,
            text: {
              content: task
            }
          }
        ]
      }
    ];
    const adaptedMessages: ChatCompletionMessageParam[] = chats2GPTMessages({
      messages,
      reserveId: false
    });

    const {
      answerText,
      usage: { inputTokens, outputTokens }
    } = await createLLMResponse({
      body: {
        model,
        temperature,
        messages: adaptedMessages,
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
    const err = getErrText(error);
    addLog.warn('call model_agent failed');
    return {
      content: err,
      inputTokens: 0,
      outputTokens: 0
    };
  }
}
