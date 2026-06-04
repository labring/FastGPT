import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import { parseJsonArgs } from '../../../../utils';
import { AgentAskPayloadSchema, type AgentAskPayload } from './tool';

type ParseAgentAskToolCallResult =
  | {
      success: true;
      ask: AgentAskPayload;
    }
  | {
      success: false;
      error: string;
    };

/**
 * 解析主 loop 调用 ask internal tool 时传入的参数。
 * 返回结构化错误而不是抛异常，方便底层 loop 把错误作为 tool response 反馈给模型。
 */
export const parseAgentAskToolCall = (
  toolCall: ChatCompletionMessageToolCall
): ParseAgentAskToolCallResult => {
  const parsed = parseJsonArgs<Record<string, unknown>>(toolCall.function.arguments);
  if (!parsed) {
    return {
      success: false,
      error: 'Ask tool arguments are not valid JSON.'
    };
  }

  const result = AgentAskPayloadSchema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      error: result.error.message
    };
  }

  return {
    success: true,
    ask: result.data
  };
};
