import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { createChatCompletion } from '../config';
import { countGptMessagesTokens, countPromptTokens } from '../../../common/string/tiktoken/index';
import { loadRequestMessages } from '../../chat/utils';
import { llmCompletionsBodyFormat } from '../utils';
import {
  PROMPT_QUESTION_GUIDE,
  PROMPT_QUESTION_GUIDE_FOOTER
} from '@fastgpt/global/core/ai/prompt/agent';
import { addLog } from '../../../common/system/log';
import json5 from 'json5';

export async function createQuestionGuide({
  messages,
  model,
  customPrompt
}: {
  messages: ChatCompletionMessageParam[];
  model: string;
  customPrompt?: string;
}): Promise<{
  result: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  const concatMessages: ChatCompletionMessageParam[] = [
    ...messages,
    {
      role: 'user',
      content: `${customPrompt || PROMPT_QUESTION_GUIDE}\n${PROMPT_QUESTION_GUIDE_FOOTER}`
    }
  ];
  const requestMessages = await loadRequestMessages({
    messages: concatMessages,
    useVision: false
  });

  const { response: data } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        model,
        temperature: 0.1,
        max_tokens: 200,
        messages: requestMessages,
        stream: false
      },
      model
    )
  });

  const answer = data.choices?.[0]?.message?.content || '';

  const start = answer.indexOf('[');
  const end = answer.lastIndexOf(']');

  const inputTokens = await countGptMessagesTokens(requestMessages);
  const outputTokens = await countPromptTokens(answer);

  if (start === -1 || end === -1) {
    addLog.warn('Create question guide error', { answer });
    return {
      result: [],
      inputTokens: 0,
      outputTokens: 0
    };
  }

  const jsonStr = answer
    .substring(start, end + 1)
    .replace(/(\\n|\\)/g, '')
    .replace(/  /g, '');

  try {
    return {
      result: json5.parse(jsonStr),
      inputTokens,
      outputTokens
    };
  } catch (error) {
    console.log(error);

    return {
      result: [],
      inputTokens: 0,
      outputTokens: 0
    };
  }
}
