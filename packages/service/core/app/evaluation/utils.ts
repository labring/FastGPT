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
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { addLog } from '../../../common/system/log';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { getEvaluationFileHeader } from '@fastgpt/global/core/app/evaluation/utils';
import {
  evaluationFileErrors,
  EvaluationStatusEnum
} from '@fastgpt/global/core/app/evaluation/constants';
import { MongoResourcePermission } from '../../../support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getGroupsByTmbId } from '../../../support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../../../support/permission/org/controllers';
import { MongoApp } from '../schema';
import { concatPer } from '../../../support/permission/controller';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { type TeamPermission } from '@fastgpt/global/support/permission/user/controller';

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

export const executeEvalItem = async ({
  evalItem,
  evaluation,
  appName
}: {
  evalItem: Document<unknown, {}, EvalItemSchemaType> & EvalItemSchemaType;
  evaluation: Document<unknown, {}, EvaluationSchemaType> & EvaluationSchemaType;
  appName: string;
}) => {
  await MongoEvalItem.updateOne(
    { _id: evalItem._id },
    {
      $set: {
        status: EvaluationStatusEnum.evaluating,
        errorMessage: null,
        response: null,
        accuracy: null,
        relevance: null,
        semanticAccuracy: null,
        score: null
      }
    }
  );

  try {
    const { timezone, externalProvider } = await getUserChatInfoAndAuthTeamPoints(evaluation.tmbId);
    const { nodes, edges, chatConfig } = await getAppLatestVersion(evaluation.appId);

    const query: UserChatItemValueItemType[] = [
      {
        type: ChatItemValueTypeEnum.text,
        text: {
          content: evalItem?.question || ''
        }
      }
    ];

    const histories = (() => {
      try {
        return evalItem?.history ? JSON.parse(evalItem.history) : [];
      } catch (error) {
        return [];
      }
    })();

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
      histories,
      stream: false,
      maxRunTimes: WORKFLOW_MAX_RUN_TIMES
    });

    const workflowTotalPoints = flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
    const workflowInputTokens = flowUsages.reduce((sum, item) => sum + (item.inputTokens || 0), 0);
    const workflowOutputTokens = flowUsages.reduce(
      (sum, item) => sum + (item.outputTokens || 0),
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
          status: EvaluationStatusEnum.completed,
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
      workflowTotalPoints,
      workflowInputTokens,
      workflowOutputTokens
    });
  } catch (error: any) {
    const errorMessage = error.message || String(error);

    await MongoEvalItem.updateOne(
      { _id: evalItem._id },
      {
        $set: {
          status: EvaluationStatusEnum.completed,
          errorMessage
        }
      }
    );

    throw error;
  }
};

export const validateEvaluationFile = async (
  rawText: string,
  appVariables?: VariableItemType[],
  standardConstants?: { evalItemsCount?: number }
) => {
  const lines = rawText.trim().split('\r\n');
  const dataLength = lines.length;

  // Validate file header
  const expectedHeader = getEvaluationFileHeader(appVariables);
  if (lines[0] !== expectedHeader) {
    addLog.error(`Header mismatch. Expected: ${expectedHeader}, Got: ${lines[0]}`);
    return Promise.reject(evaluationFileErrors);
  }

  // Validate data rows count
  if (dataLength <= 1) {
    addLog.error('No data rows found');
    return Promise.reject(evaluationFileErrors);
  }

  const maxRows = standardConstants?.evalItemsCount;
  if (maxRows && dataLength - 1 > maxRows) {
    addLog.error(`Too many rows. Max: ${maxRows}, Got: ${dataLength - 1}`);
    return Promise.reject(evaluationFileErrors);
  }

  const headers = lines[0].split(',');

  // Get required field indices
  const requiredFields = headers
    .map((header, index) => ({ header: header.trim(), index }))
    .filter(({ header }) => header.startsWith('*'));

  const errors: string[] = [];

  // Validate each data row
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].trim().split(',');

    // Check required fields
    requiredFields.forEach(({ header, index }) => {
      if (!values[index]?.trim()) {
        errors.push(`Row ${i + 1}: required field "${header}" is empty`);
      }
    });

    // Validate app variables
    if (appVariables) {
      validateRowVariables({
        values,
        variables: appVariables,
        rowNum: i + 1,
        errors
      });
    }
  }

  if (errors.length > 0) {
    addLog.error(`Validation failed: ${errors.join('; ')}`);
    return Promise.reject(evaluationFileErrors);
  }

  return { lines, dataLength };
};

const validateRowVariables = ({
  values,
  variables,
  rowNum,
  errors
}: {
  values: string[];
  variables: VariableItemType[];
  rowNum: number;
  errors: string[];
}) => {
  variables.forEach((variable, index) => {
    const value = values[index]?.trim();

    // Skip validation if value is empty and not required
    if (!value && !variable.required) return;

    switch (variable.type) {
      case VariableInputEnum.input:
        // Validate string length
        if (variable.maxLength && value && value.length > variable.maxLength) {
          errors.push(
            `Row ${rowNum}: "${variable.label}" exceeds max length (${variable.maxLength})`
          );
        }
        break;

      case VariableInputEnum.numberInput:
        // Validate number type and range
        if (value) {
          const numValue = Number(value);
          if (isNaN(numValue)) {
            errors.push(`Row ${rowNum}: "${variable.label}" must be a number`);
          } else {
            if (variable.min !== undefined && numValue < variable.min) {
              errors.push(`Row ${rowNum}: "${variable.label}" below minimum (${variable.min})`);
            }
            if (variable.max !== undefined && numValue > variable.max) {
              errors.push(`Row ${rowNum}: "${variable.label}" exceeds maximum (${variable.max})`);
            }
          }
        }
        break;

      case VariableInputEnum.select:
        // Validate select options
        if (value && variable.enums?.length) {
          const validOptions = variable.enums.map((item) => item.value);
          if (!validOptions.includes(value)) {
            errors.push(
              `Row ${rowNum}: "${variable.label}" invalid option. Valid: [${validOptions.join(', ')}]`
            );
          }
        }
        break;
    }
  });
};

export const getAccessibleAppIds = async (
  teamId: string,
  tmbId: string,
  teamPer: TeamPermission
) => {
  if (teamPer.isOwner) {
    return null;
  }

  const [perList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      resourceId: { $exists: true }
    }).lean(),
    getGroupsByTmbId({ tmbId, teamId }).then((groups) => {
      const map = new Map<string, 1>();
      groups.forEach((group) => map.set(String(group._id), 1));
      return map;
    }),
    getOrgIdSetWithParentByTmbId({ teamId, tmbId })
  ]);

  const myPerList = perList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  const idList = { _id: { $in: myPerList.map((item) => item.resourceId) } };
  const appPerQuery = { $or: [idList, { parentId: null }] };

  const myApps = await MongoApp.find(
    { ...appPerQuery, teamId },
    '_id parentId type tmbId inheritPermission'
  ).lean();

  const accessibleApps = myApps.filter((app) => {
    const getPer = (appId: string) => {
      const tmbPer = myPerList.find(
        (item) => String(item.resourceId) === appId && !!item.tmbId
      )?.permission;
      const groupPer = concatPer(
        myPerList
          .filter((item) => String(item.resourceId) === appId && (!!item.groupId || !!item.orgId))
          .map((item) => item.permission)
      );

      return new AppPermission({
        per: tmbPer ?? groupPer ?? AppDefaultPermissionVal,
        isOwner: String(app.tmbId) === String(tmbId)
      });
    };

    const Per =
      !AppFolderTypeList.includes(app.type) && app.parentId && app.inheritPermission
        ? getPer(String(app.parentId))
        : getPer(String(app._id));

    return Per.hasManagePer;
  });

  return accessibleApps.map((app) => app._id);
};
