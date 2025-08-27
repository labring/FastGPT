import { addLog } from '../../common/system/log';
import type { Job } from '../../common/bullmq';
import { getEvaluationWorker, type EvaluationJobData, removeEvaluationJob } from './mq';
import { MongoEvalItem } from './evalItemSchema';
import { Types } from 'mongoose';
import { dispatchWorkFlow } from '../workflow/dispatch';
import { MongoEvaluation } from './evalSchema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getAppLatestVersion } from '../../core/app/version/controller';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WORKFLOW_MAX_RUN_TIMES } from '../../core/workflow/constants';
import { getAppEvaluationScore } from './scoring';
import { checkTeamAIPoints } from '../../support/permission/teamLimit';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import type {
  EvalItemSchemaType,
  EvaluationSchemaType
} from '@fastgpt/global/core/evaluation/type';
import type { Document } from 'mongoose';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import {
  InformLevelEnum,
  SendInformTemplateCodeEnum
} from '@fastgpt/global/support/user/inform/constants';
import type { AppChatConfigType, AppSchema } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatModelChars2Points } from '../../support/wallet/usage/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { concatUsage } from '../../support/wallet/usage/controller';
import { MongoApp } from '../../core/app/schema';
import { delay } from '@fastgpt/global/common/system/utils';
import { removeDatasetCiteText } from '../../core/ai/utils';
import { getUserChatInfoAndAuthTeamPoints } from '../../support/permission/auth/team';
import { getRunningUserInfoByTmbId } from '../../support/user/team/utils';
import { getEvalDatasetDataQualityWorker } from './dataQualityMq';
import { processEvalDatasetDataQuality } from './dataQualityProcessor';
import { getEvalDatasetSmartGenerateWorker } from './smartGenerateMq';
import { getEvalDatasetDataSynthesizeWorker } from './dataSynthesizeMq';

type AppContextType = {
  appData: AppSchema;
  timezone: string;
  externalProvider: Record<string, any>;
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
};

export const initEvaluationWorker = () => {
  addLog.info('Init Evaluation Worker...');
  getEvalDatasetDataQualityWorker(processEvalDatasetDataQuality);
  getEvaluationWorker(processor);

  import('./smartGenerateProcessor')
    .then(({ initEvalDatasetSmartGenerateWorker }) => {
      initEvalDatasetSmartGenerateWorker();
      addLog.info('Smart generate worker initialized');
    })
    .catch((error) => {
      addLog.error('Failed to init smart generate worker', { error });
    });

  import('./dataSynthesizeProcessor')
    .then(({ initEvalDatasetDataSynthesizeWorker }) => {
      initEvalDatasetDataSynthesizeWorker();
      addLog.info('Data synthesize worker initialized');
    })
    .catch((error) => {
      addLog.error('Failed to init data synthesize worker', { error });
    });
};

const dealAiPointCheckError = async (evalId: string, error: any) => {
  if (error === TeamErrEnum.aiPointsNotEnough) {
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      { $set: { errorMessage: error } }
    );

    const evaluation = await MongoEvaluation.findById(evalId).lean();
    if (evaluation) {
      sendInform2OneUser({
        level: InformLevelEnum.important,
        templateCode: 'LACK_OF_POINTS',
        templateParam: {},
        teamId: evaluation.teamId
      });
    }
    return;
  }

  return Promise.reject(error);
};

const finishEvaluation = async (evalId: string) => {
  // Computed all eval score and add to evaluation collection
  const scoreResult = await MongoEvalItem.aggregate([
    {
      $match: {
        evalId: new Types.ObjectId(evalId),
        status: EvaluationStatusEnum.completed,
        errorMessage: { $exists: false },
        score: { $exists: true }
      }
    },
    {
      $group: {
        _id: null,
        avgScore: { $avg: '$score' }
      }
    }
  ]);

  const avgScore = scoreResult.length > 0 ? scoreResult[0].avgScore : 0;

  await MongoEvaluation.updateOne(
    { _id: new Types.ObjectId(evalId) },
    {
      $set: {
        finishTime: new Date(),
        score: avgScore
      }
    }
  );

  addLog.info('[Evaluation] Task finished', { evalId, avgScore });
};

const handleEvalItemError = async (
  evalItem: Document<unknown, {}, EvalItemSchemaType> & EvalItemSchemaType,
  error: any
) => {
  const errorMessage = getErrText(error);

  await MongoEvalItem.updateOne(
    { _id: evalItem._id },
    {
      $inc: { retry: -1 },
      $set: {
        errorMessage
      }
    }
  );
};

const createMergedEvaluationUsage = async (
  params: {
    evaluation: EvaluationSchemaType;
    totalPoints: number;
  } & (
    | {
        type: 'run';
      }
    | {
        type: 'eval';
        inputTokens: number;
        outputTokens: number;
      }
  )
) => {
  const { evaluation, totalPoints } = params;

  if (params.type === 'run') {
    await concatUsage({
      billId: evaluation.usageId,
      teamId: evaluation.teamId,
      tmbId: evaluation.tmbId,
      totalPoints,
      count: 1,
      listIndex: 0
    });
  } else if (params.type === 'eval') {
    await concatUsage({
      billId: evaluation.usageId,
      teamId: evaluation.teamId,
      tmbId: evaluation.tmbId,
      totalPoints,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      listIndex: 1
    });
  }
};

const processEvalItem = async ({
  evalItem,
  evaluation,
  appContext
}: {
  evalItem: Document<unknown, {}, EvalItemSchemaType> & EvalItemSchemaType;
  evaluation: EvaluationSchemaType;
  appContext: AppContextType;
}) => {
  const getAppAnswer = async (): Promise<string> => {
    if (evalItem?.response) {
      return evalItem.response;
    }

    const { appData, timezone, externalProvider, nodes, edges, chatConfig } = appContext;
    const chatId = getNanoid();

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
      chatId,
      timezone,
      externalProvider,
      mode: 'chat',
      runningAppInfo: {
        id: String(appData._id),
        teamId: String(appData.teamId),
        tmbId: String(appData.tmbId)
      },
      runningUserInfo: await getRunningUserInfoByTmbId(evaluation.tmbId),
      uid: String(evaluation.tmbId),
      runtimeNodes: storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)),
      runtimeEdges: storeEdges2RuntimeEdges(edges),
      variables: evalItem?.globalVariables || {},
      query,
      chatConfig,
      histories,
      stream: false,
      maxRunTimes: WORKFLOW_MAX_RUN_TIMES
    });
    const totalPoints = flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
    const appAnswer = removeDatasetCiteText(assistantResponses[0]?.text?.content || '', false);

    evalItem.response = appAnswer;
    evalItem.responseTime = new Date();
    await evalItem.save();

    // Push usage
    createMergedEvaluationUsage({
      evaluation,
      totalPoints,
      type: 'run'
    });

    return appAnswer;
  };

  const appAnswer = await getAppAnswer();

  // Eval score
  const { accuracyScore, usage } = await getAppEvaluationScore({
    question: evalItem?.question || '',
    appAnswer,
    standardAnswer: evalItem?.expectedResponse || '',
    model: evaluation.evalModel
  });

  evalItem.status = EvaluationStatusEnum.completed;
  evalItem.accuracy = accuracyScore;
  evalItem.score = accuracyScore;
  evalItem.finishTime = new Date();
  await evalItem.save();

  // Push usage
  const { totalPoints: evalModelPoints } = formatModelChars2Points({
    model: evaluation.evalModel,
    modelType: ModelTypeEnum.llm,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });
  createMergedEvaluationUsage({
    evaluation,
    totalPoints: evalModelPoints,
    type: 'eval',
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });
};

const processor = async (job: Job<EvaluationJobData>) => {
  const { evalId } = job.data;

  // 初始化检查
  const evaluation = await MongoEvaluation.findById(evalId);
  if (!evaluation) {
    addLog.warn('[Evaluation] Eval not found', { evalId });
    await removeEvaluationJob(evalId);
    return;
  }

  const appData = await MongoApp.findById(evaluation.appId);
  if (!appData) {
    addLog.warn('[Evaluation] App not found', { evalId });
    await removeEvaluationJob(evalId);
    return;
  }

  const [{ timezone, externalProvider }, { nodes, edges, chatConfig }] = await Promise.all([
    getUserChatInfoAndAuthTeamPoints(appData.tmbId),
    getAppLatestVersion(appData._id, appData),
    // Reset error message
    MongoEvaluation.updateOne({ _id: new Types.ObjectId(evalId) }, { $set: { errorMessage: null } })
  ]);

  const appContext: AppContextType = {
    appData,
    timezone,
    externalProvider,
    nodes,
    edges,
    chatConfig
  };

  // 主循环
  while (true) {
    try {
      await checkTeamAIPoints(evaluation.teamId);
    } catch (error) {
      return await dealAiPointCheckError(evalId, error);
    }

    const evalItem = await MongoEvalItem.findOneAndUpdate(
      {
        evalId,
        status: { $in: [EvaluationStatusEnum.queuing, EvaluationStatusEnum.evaluating] },
        retry: { $gt: 0 }
      },
      {
        $set: { status: EvaluationStatusEnum.evaluating }
      }
    );
    if (!evalItem) {
      await finishEvaluation(evalId);
      break;
    }

    // Process eval item
    try {
      await processEvalItem({
        evalItem,
        evaluation,
        appContext
      });
    } catch (error) {
      if (error === 'Evaluation model not found') {
        addLog.warn('[Evaluation] Model not found', { evalId, model: evaluation.evalModel });

        await MongoEvaluation.updateOne(
          { _id: new Types.ObjectId(evalId) },
          { $set: { errorMessage: `Model ${evaluation.evalModel} not found` } }
        ).catch();

        break;
      }

      await handleEvalItemError(evalItem, error);
      await delay(100);
    }
  }
};
function getMessageTemplate(templateCode: any): {
  getInformTemplate: any;
  lockMinutes: any;
  isSendQueue: any;
} {
  throw new Error('Function not implemented.');
}

function sendInform2OneUser(arg0: {
  level: InformLevelEnum;
  templateCode: string;
  templateParam: {};
  teamId: string;
}) {
  addLog.warn('sendInform2OneUser: Starting notification process:', arg0);
}
