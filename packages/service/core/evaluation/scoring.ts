import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getLLMModel } from '../../core/ai/model';
import { createChatCompletion } from '../../core/ai/config';
import { formatLLMResponse, llmCompletionsBodyFormat } from '../../core/ai/utils';
import { loadRequestMessages } from '../../core/chat/utils';
import { countGptMessagesTokens, countPromptTokens } from '../../common/string/tiktoken';

const template_accuracy1 = `
Instruction: You are a world class state of the art assistant for rating a User Answer given a Question. The Question is completely answered by the Reference Answer.
Say 4, if User Answer is full contained and equivalent to Reference Answer in all terms, topics, numbers, metrics, dates and units.
Say 2, if User Answer is partially contained and almost equivalent to Reference Answer in all terms, topics, numbers, metrics, dates and units.
Say 0, if User Answer is not contained in Reference Answer or not accurate in all terms, topics, numbers, metrics, dates and units or the User Answer do not answer the question.
Do not explain or justify your rating. Your rating must be only 4, 2 or 0 according to the instructions above.

## Question
{query}

## Answer0
{sentence_inference}

## Answer1
{sentence_true}

## Rating`;

const template_accuracy2 = `
I will rate the User Answer in comparison to the Reference Answer for a given Question.
A rating of 4 indicates that the User Answer is entirely consistent with the Reference Answer, covering all aspects, topics, numbers, metrics, dates, and units.
A rating of 2 signifies that the User Answer is mostly aligned with the Reference Answer, with minor discrepancies in some areas.
A rating of 0 means that the User Answer is either inaccurate, incomplete, or unrelated to the Reference Answer, or it fails to address the Question.
I will provide the rating without any explanation or justification, adhering to the following scale: 0 (no match), 2 (partial match), 4 (exact match).
Do not explain or justify my rating. My rating must be only 4, 2 or 0 only.

## Question
{query}

## Answer0
{sentence_inference}

## Answer1
{sentence_true}

## Rating`;

export const getAppEvaluationScore = async ({
  question,
  appAnswer,
  standardAnswer,
  model
}: {
  question: string;
  appAnswer: string;
  standardAnswer: string;
  model: string;
}) => {
  const modelData = getLLMModel(model);
  if (!modelData) {
    return Promise.reject('Evaluation model not found');
  }

  const getEvalResult = async (template: string) => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: template
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: [
          {
            type: 'text',
            text: `## Question
${question}

## Answer0
${appAnswer}

## Answer1
${standardAnswer}

## Rating`
          }
        ]
      }
    ];
    const { response } = await createChatCompletion({
      body: llmCompletionsBodyFormat(
        {
          model: modelData.model,
          temperature: 0.3,
          messages: await loadRequestMessages({ messages, useVision: true }),
          stream: true,
          max_tokens: 5
        },
        modelData
      )
    });

    const { text, usage } = await formatLLMResponse(response);

    const numberText = Number(text);
    const rate = isNaN(numberText) ? 0 : numberText / 4;

    return {
      rate,
      inputTokens: usage?.prompt_tokens || (await countGptMessagesTokens(messages)),
      outputTokens: usage?.completion_tokens || (await countPromptTokens(text))
    };
  };

  const results = await Promise.all([
    getEvalResult(template_accuracy1),
    getEvalResult(template_accuracy2)
  ]);

  const accuracyScore =
    Math.round((results.reduce((acc, item) => acc + item.rate, 0) / results.length) * 100) / 100;
  const inputTokens = results.reduce((acc, item) => acc + item.inputTokens, 0);
  const outputTokens = results.reduce((acc, item) => acc + item.outputTokens, 0);

  return {
    accuracyScore,
    usage: {
      inputTokens,
      outputTokens
    }
  };
};
