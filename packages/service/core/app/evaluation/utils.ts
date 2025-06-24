import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { getLLMModel } from '../../ai/model';
import { createChatCompletion } from '../../ai/config';
import { formatLLMResponse, llmCompletionsBodyFormat } from '../../ai/utils';
import { loadRequestMessages } from '../../chat/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUserChatInfoAndAuthTeamPoints } from '../../../support/permission/auth/team';
import { getAppLatestVersion } from '../version/controller';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WORKFLOW_MAX_RUN_TIMES } from '../../../core/workflow/constants';
import { createEvaluationRerunUsage } from '../../../support/wallet/usage/controller';
import { dispatchWorkFlow } from '../../../core/workflow/dispatch';
import { MongoEvalItem } from './evalItemSchema';
import type { EvalItemSchemaType, EvaluationSchemaType } from './type';
import type { Document } from 'mongoose';

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

export const executeEvalItemWithRetry = async ({
  evalItem,
  evaluation,
  appName
}: {
  evalItem: Document<unknown, {}, EvalItemSchemaType> & EvalItemSchemaType;
  evaluation: Document<unknown, {}, EvaluationSchemaType> & EvaluationSchemaType;
  appName: string;
}) => {
  const executeWithRetry = async (): Promise<void> => {
    try {
      await MongoEvalItem.updateOne(
        { _id: evalItem._id },
        {
          $set: {
            status: 1,
            errorMessage: null,
            response: null,
            accuracy: null,
            relevance: null,
            semanticAccuracy: null,
            score: null,
            retry: 3
          }
        }
      );

      const { timezone, externalProvider } = await getUserChatInfoAndAuthTeamPoints(
        evaluation.tmbId
      );
      const { nodes, edges, chatConfig } = await getAppLatestVersion(evaluation.appId);

      const query: UserChatItemValueItemType[] = [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: evalItem?.question || ''
          }
        }
      ];

      const { assistantResponses, flowUsages } = await dispatchWorkFlow({
        chatId: getNanoid(),
        timezone,
        externalProvider,
        mode: 'chat',
        runningAppInfo: {
          id: String(evaluation.appId),
          teamId: String(evaluation.teamId),
          tmbId: String(evaluation.tmbId)
        },
        runningUserInfo: {
          teamId: String(evaluation.teamId),
          tmbId: String(evaluation.tmbId)
        },
        uid: String(evaluation.tmbId),
        runtimeNodes: storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)),
        runtimeEdges: storeEdges2RuntimeEdges(edges),
        variables: evalItem?.globalVariales || {},
        query,
        chatConfig,
        histories: [],
        stream: false,
        maxRunTimes: WORKFLOW_MAX_RUN_TIMES
      });

      const workflowTotalPoints = flowUsages.reduce(
        (sum, item) => sum + (item.totalPoints || 0),
        0
      );

      const appAnswer = assistantResponses[0]?.text?.content || '';
      const { evalRes, evalUsages } = await getAppEvaluationScore({
        question: evalItem?.question || '',
        appAnswer,
        standardAnswer: evalItem?.expectedResponse || '',
        model: evaluation.agentModel
      });

      await MongoEvalItem.updateOne(
        { _id: evalItem._id },
        {
          $set: {
            status: 2,
            response: appAnswer,
            accuracy: evalRes,
            relevance: null,
            semanticAccuracy: null,
            score: evalRes,
            errorMessage: null
          }
        }
      );

      await createEvaluationRerunUsage({
        teamId: String(evaluation.teamId),
        tmbId: String(evaluation.tmbId),
        appName,
        model: evaluation.agentModel,
        inputTokens: evalUsages.totalInputTokens,
        outputTokens: evalUsages.totalOutputTokens,
        workflowTotalPoints
      });
    } catch (error: any) {
      const errorMessage = error.message || String(error);

      const updatedEvalItem = await MongoEvalItem.findById(evalItem._id);
      const remainingRetries = updatedEvalItem?.retry || 0;

      if (remainingRetries > 0) {
        await MongoEvalItem.updateOne(
          { _id: evalItem._id },
          {
            $set: {
              status: 0
            },
            $inc: { retry: -1 }
          }
        );

        return await executeWithRetry();
      } else {
        await MongoEvalItem.updateOne(
          { _id: evalItem._id },
          {
            $set: {
              status: 2,
              errorMessage,
              retry: 0
            }
          }
        );
        throw error;
      }
    }
  };

  await executeWithRetry();
};
