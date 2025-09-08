import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '../../../../../../common/system/log';
import { createLLMResponse, type ResponseEvents } from '../../../../../ai/llm/request';
import { defaultPlanAgentPrompt } from './prompt';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { chats2GPTMessages, getSystemPrompt_ChatItemType } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';

type PlanAgentConfig = {
  model: string;
  customSystemPrompt?: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
};

type transferPlanAgentProps = {
  histories: ChatItemType[];
  instruction?: string;
} & PlanAgentConfig &
  Pick<ResponseEvents, 'onStreaming' | 'onReasoning'>;

export async function transferPlanAgent({
  instruction = '',
  histories,

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
  try {
    const messages: ChatItemType[] = [
      ...getSystemPrompt_ChatItemType(
        replaceVariable(defaultPlanAgentPrompt, {
          userRole: customSystemPrompt
        })
      ),
      ...histories,
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            type: ChatItemValueTypeEnum.text,
            text: {
              content: instruction
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
    addLog.warn('call plan_agent failed');
    return {
      content: err,
      inputTokens: 0,
      outputTokens: 0
    };
  }
}
