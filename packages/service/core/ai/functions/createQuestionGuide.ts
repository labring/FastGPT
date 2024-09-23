import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { getAIApi } from '../config';
import { countGptMessagesTokens } from '../../../common/string/tiktoken/index';
import { loadRequestMessages } from '../../chat/utils';
import { llmCompletionsBodyFormat } from '../utils';

export const Prompt_QuestionGuide = `你是一个AI智能助手，你的任务是结合对话记录，推测我下一步的问题。
你需要生成 3 个可能的问题，引导我继续提问，生成的问题要求：
1. 生成问题的语言，与最后一个用户提问语言一致。
2. 问题的长度应小于20个字符。
3. 按 JSON 格式返回: ["question1", "question2", "question3"]。`;

export async function createQuestionGuide({
  messages,
  model
}: {
  messages: ChatCompletionMessageParam[];
  model: string;
}) {
  const concatMessages: ChatCompletionMessageParam[] = [
    ...messages,
    {
      role: 'user',
      content: Prompt_QuestionGuide
    }
  ];

  const ai = getAIApi({
    timeout: 480000
  });
  const data = await ai.chat.completions.create(
    llmCompletionsBodyFormat(
      {
        model,
        temperature: 0.1,
        max_tokens: 200,
        messages: await loadRequestMessages({
          messages: concatMessages,
          useVision: false
        }),
        stream: false
      },
      model
    )
  );

  const answer = data.choices?.[0]?.message?.content || '';

  const start = answer.indexOf('[');
  const end = answer.lastIndexOf(']');

  const tokens = await countGptMessagesTokens(concatMessages);

  if (start === -1 || end === -1) {
    return {
      result: [],
      tokens: 0
    };
  }

  const jsonStr = answer
    .substring(start, end + 1)
    .replace(/(\\n|\\)/g, '')
    .replace(/  /g, '');

  try {
    return {
      result: JSON.parse(jsonStr),
      tokens
    };
  } catch (error) {
    return {
      result: [],
      tokens: 0
    };
  }
}
