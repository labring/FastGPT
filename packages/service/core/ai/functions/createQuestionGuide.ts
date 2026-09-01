import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import {
  QuestionGuidePrompt,
  QuestionGuideFooterPrompt
} from '@fastgpt/global/core/ai/prompt/agent';
import json5 from 'json5';
import { createLLMResponse } from '../llm/request';
import { getLogger, LogCategories } from '../../../common/logger';
import type { LLMSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

const logger = getLogger(LogCategories.MODULE.AI.FUNCTIONS);

export async function createQuestionGuide({
  messages,
  model,
  customPrompt,
  teamId
}: {
  messages: ChatCompletionMessageParam[];
  model: LLMSystemModelDataType;
  customPrompt?: string;
  teamId: string;
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
    teamId,
    saveLLMResponseRecord: false,
    body: {
      model,
      messages: concatMessages,
      stream: true,
      ...(model.config.reasoning ? { reasoning_effort: 'none' as const } : {})
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
