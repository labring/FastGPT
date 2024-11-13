import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { createChatCompletion } from '../config';
import { countGptMessagesTokens } from '../../../common/string/tiktoken/index';
import { loadRequestMessages } from '../../chat/utils';
import { llmCompletionsBodyFormat } from '../utils';

export const Prompt_QuestionGuide = `You are an AI assistant tasked with predicting the user's next question based on the conversation history. Your goal is to generate 3 potential questions that will guide the user to continue the conversation. When generating these questions, adhere to the following rules:

1. Use the same language as the user's last question in the conversation history.
2. Keep each question under 20 characters in length.
3. Return the questions in JSON format: ["question1", "question2", "question3"].

Analyze the conversation history provided to you and use it as context to generate relevant and engaging follow-up questions. Your predictions should be logical extensions of the current topic or related areas that the user might be interested in exploring further.

Remember to maintain consistency in tone and style with the existing conversation while providing diverse options for the user to choose from. Your goal is to keep the conversation flowing naturally and help the user delve deeper into the subject matter or explore related topics.`;

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

  const { response: data } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
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
  });

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
