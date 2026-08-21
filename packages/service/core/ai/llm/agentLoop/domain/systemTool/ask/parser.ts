import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { formatAgentAskAnswers, parseAgentAskAnswers } from '@fastgpt/global/core/ai/agent/utils';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import { parseJsonArgs } from '../../../../../utils';
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

/**
 * 将新版 ask_user 的 JSON 回答渲染为模型可读的问答文本。
 * 题目只保存在原始 tool call 参数中，所以需要先查找到对应的 tool call，
 * 再从 tool call 参数中获取题目，拼接到一起发送给模型。
 */
export const formatAgentAskToolResponse = ({
  messages,
  askToolCallId,
  answer
}: {
  messages: ChatCompletionMessageParam[];
  askToolCallId: string;
  answer: string;
}) => {
  const answers = parseAgentAskAnswers(answer);

  const askToolCall = messages
    .flatMap((message) =>
      message.role === ChatCompletionRequestMessageRoleEnum.Assistant
        ? message.tool_calls || []
        : []
    )
    .find((call) => call.id === askToolCallId);
  if (!askToolCall) return answer;

  const parsedAsk = parseAgentAskToolCall(askToolCall);
  if (!parsedAsk.success) return answer;

  return formatAgentAskAnswers({
    questions: parsedAsk.ask.questions,
    answers
  });
};
