import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { getLLMModel } from '../../ai/model';
import { createChatCompletion } from '../../ai/config';
import { formatLLMResponse, llmCompletionsBodyFormat } from '../../ai/utils';
import { loadRequestMessages } from '../../chat/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { formatModelChars2Points } from '../../../support/wallet/usage/utils';

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
  const template_accuracy1 =
    'Instruction: You are a world class state of the art assistant for rating ' +
    'a User Answer given a Question. The Question is completely answered by the Reference Answer.\n' +
    'Say 4, if User Answer is full contained and equivalent to Reference Answer' +
    'in all terms, topics, numbers, metrics, dates and units.\n' +
    'Say 2, if User Answer is partially contained and almost equivalent to Reference Answer' +
    'in all terms, topics, numbers, metrics, dates and units.\n' +
    'Say 0, if User Answer is not contained in Reference Answer or not accurate in all terms, topics,' +
    'numbers, metrics, dates and units or the User Answer do not answer the question.\n' +
    'Do not explain or justify your rating. Your rating must be only 4, 2 or 0 according to the instructions above.\n' +
    '### Question: {query}\n' +
    '### {answer0}: {sentence_inference}\n' +
    '### {answer1}: {sentence_true}\n' +
    'The rating is:\n';
  const template_accuracy2 =
    'I will rate the User Answer in comparison to the Reference Answer for a given Question.\n' +
    'A rating of 4 indicates that the User Answer is entirely consistent with the Reference Answer, covering all aspects, topics, numbers, metrics, dates, and units.\n' +
    'A rating of 2 signifies that the User Answer is mostly aligned with the Reference Answer, with minor discrepancies in some areas.\n' +
    'A rating of 0 means that the User Answer is either inaccurate, incomplete, or unrelated to the Reference Answer, or it fails to address the Question.\n' +
    'I will provide the rating without any explanation or justification, adhering to the following scale: 0 (no match), 2 (partial match), 4 (exact match).\n' +
    'Do not explain or justify my rating. My rating must be only 4, 2 or 0 only.\n\n' +
    'Question: {query}\n\n' +
    '{answer0}: {sentence_inference}\n\n' +
    '{answer1}: {sentence_true}\n\n' +
    'Rating: ';

  const messages1: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: template_accuracy1
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: [
        {
          type: 'text',
          text: `
              Question: ${question}
              {answer0}: ${appAnswer}
              {answer1}: ${standardAnswer}
            `
        }
      ]
    }
  ];

  const messages2: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: template_accuracy2
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: [
        {
          type: 'text',
          text: `
              Question: ${question}
              {answer0}: ${standardAnswer}
              {answer1}: ${appAnswer}
            `
        }
      ]
    }
  ];

  const modelData = getLLMModel(model);
  if (!modelData) {
    return Promise.reject('Evaluation model not found');
  }

  const { response: chatResponse1 } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        model: modelData.model,
        temperature: 0.3,
        messages: await loadRequestMessages({ messages: messages1, useVision: true }),
        stream: true
      },
      modelData
    )
  });
  const { text: answer1, usage: usage1 } = await formatLLMResponse(chatResponse1);
  const rate1 = Number(answer1) / 4;

  const { response: chatResponse2 } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        model: modelData.model,
        temperature: 0.3,
        messages: await loadRequestMessages({ messages: messages2, useVision: true }),
        stream: true
      },
      modelData
    )
  });
  const { text: answer2, usage: usage2 } = await formatLLMResponse(chatResponse2);
  const rate2 = Number(answer2) / 4;

  const totalInputTokens = (usage1?.prompt_tokens || 0) + (usage2?.prompt_tokens || 0);
  const totalOutputTokens = (usage1?.completion_tokens || 0) + (usage2?.completion_tokens || 0);

  return {
    evalRes: (rate1 + rate2) / 2,
    evalUsages: {
      totalInputTokens,
      totalOutputTokens
    }
  };
};
