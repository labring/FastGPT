import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getLLMModel } from '../../ai/model';
import { createChatCompletion } from '../../ai/config';
import { formatLLMResponse, llmCompletionsBodyFormat } from '../../ai/utils';
import { loadRequestMessages } from '../../chat/utils';
import { countGptMessagesTokens, countPromptTokens } from '../../../common/string/tiktoken';

const formatPromptTemplate = (template: string, params: Record<string, string>): string => {
  return Object.entries(params).reduce((formatted, [key, value]) => {
    return formatted.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }, template);
};

const DEFAULT_ACCURACY_PROMPT = `Please evaluate the accuracy of the following response:
Question: {{userInput}}
Expected Answer: {{expectedOutput}}
Actual Answer: {{actualOutput}}
Please provide a score from 0 to 1 based on accuracy and relevance.`;

export const getAppEvaluationScore = async ({
  userInput,
  appAnswer,
  standardAnswer,
  model,
  prompt
}: {
  userInput: string;
  appAnswer: string;
  standardAnswer: string;
  model: string;
  prompt?: string;
}) => {
  const modelData = getLLMModel(model);
  if (!modelData) {
    return Promise.reject('Evaluation model not found');
  }

  const templateToUse = prompt || DEFAULT_ACCURACY_PROMPT;
  const formattedPrompt = formatPromptTemplate(templateToUse, {
    userInput,
    actualOutput: appAnswer,
    expectedOutput: standardAnswer
  });

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: formattedPrompt
    }
  ];

  const { response } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        model: modelData.model,
        temperature: 0.3,
        messages: await loadRequestMessages({ messages, useVision: true }),
        stream: true,
        max_tokens: 20
      },
      modelData
    )
  });

  const { text, usage } = await formatLLMResponse(response);

  const numberText = parseFloat(text.trim());
  const score = isNaN(numberText) ? 0 : Math.max(0, Math.min(1, numberText));

  return {
    score,
    usage: {
      inputTokens: usage?.prompt_tokens || (await countGptMessagesTokens(messages)),
      outputTokens: usage?.completion_tokens || (await countPromptTokens(text))
    }
  };
};
