import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import {
  QuestionGuidePrompt,
  QuestionGuideFooterPrompt
} from '@fastgpt/global/core/ai/prompt/agent';
import json5 from 'json5';
import { createLLMResponse } from '../llm/request';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI.FUNCTIONS);

export async function createQuestionGuide({
  messages,
  modelId,
  customPrompt
}: {
  messages: ChatCompletionMessageParam[];
  modelId: string;
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
    finish_reason,
    error: llmError,
    usage: { inputTokens, outputTokens }
  } = await createLLMResponse({
    body: {
      modelId,
      temperature: 0.1,
      max_tokens: 200,
      messages: concatMessages,
      stream: true
    }
  });

  if (finish_reason !== 'stop') {
    logger.warn('Question guide response abnormal finish_reason', {
      finish_reason,
      llmError,
      answer
    });
  }

  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');

  if (start === -1 || end === -1) {
    logger.warn('Question guide response missing JSON object', { answer });
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
    const parsed = json5.parse(jsonStr) as { language?: string; questions?: string[] };
    if (parsed.language) {
      logger.debug('Question guide language', { language: parsed.language });
    }
    return {
      result: Array.isArray(parsed.questions) ? parsed.questions : [],
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
