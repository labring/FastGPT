import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import {
  QuestionGuidePrompt,
  QuestionGuideFooterPrompt
} from '@fastgpt/global/core/ai/prompt/agent';
import json5 from 'json5';
import { createLLMResponse } from '../llm/request';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI);

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
      content: `${customPrompt || QuestionGuidePrompt}\n${QuestionGuideFooterPrompt}`
    }
  ];

  const {
    answerText: answer,
    usage: { inputTokens, outputTokens }
  } = await createLLMResponse({
    body: {
      model,
      temperature: 0.1,
      max_tokens: 200,
      messages: concatMessages,
      stream: true
    }
  });

  const start = answer.indexOf('[');
  const end = answer.lastIndexOf(']');

  if (start === -1 || end === -1) {
    logger.warn('Question guide response missing JSON array', { answer });
    return {
      result: [],
      inputTokens,
      outputTokens
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
    logger.warn('Failed to parse question guide JSON', { error, raw: jsonStr });

    return {
      result: [],
      inputTokens,
      outputTokens
    };
  }
}
