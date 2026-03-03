import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { MongoUsage } from './schema';
import { type ClientSession } from '../../../common/mongo';
import { addLog } from '../../../common/system/log';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type {
  PushUsageItemsProps,
  ConcatUsageProps,
  CreateUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import { i18nT } from '../../../../web/i18n/utils';
import { formatModelChars2Points } from './utils';
import { MongoUsageItem } from './usageItemSchema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';

export async function createUsage(data: CreateUsageProps) {
  try {
    return await global.createUsageHandler(data);
  } catch (error) {
    addLog.error('createUsage error', error);
  }
}
export async function concatUsage(data: ConcatUsageProps) {
  try {
    await global.concatUsageHandler(data);
  } catch (error) {
    addLog.error('concatUsage error', error);
  }
}
export async function pushUsageItems(data: PushUsageItemsProps) {
  try {
    await global.pushUsageItemsHandler(data);
  } catch (error) {
    addLog.error('pushUsageItems error', error);
  }
}

export const createPdfParseUsage = async ({
  teamId,
  tmbId,
  pages,
  usageId
}: {
  teamId: string;
  tmbId: string;
  pages: number;
  usageId?: string;
}) => {
  const unitPrice = global.systemEnv?.customPdfParse?.price || 0;
  const totalPoints = pages * unitPrice;

  if (usageId) {
    pushUsageItems({
      teamId,
      usageId,
      list: [{ moduleName: i18nT('account_usage:pdf_enhanced_parse'), amount: totalPoints, pages }]
    });
  } else {
    createUsage({
      teamId,
      tmbId,
      appName: i18nT('account_usage:pdf_enhanced_parse'),
      totalPoints,
      source: UsageSourceEnum.pdfParse,
      list: [
        {
          moduleName: i18nT('account_usage:pdf_enhanced_parse'),
          amount: totalPoints,
          pages
        }
      ]
    });
  }
};

export const pushLLMTrainingUsage = async ({
  teamId,
  model,
  inputTokens,
  outputTokens,
  usageId,
  type
}: {
  teamId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usageId: string;
  type: UsageItemTypeEnum;
}) => {
  // Compute points
  const { totalPoints } = formatModelChars2Points({
    model,
    inputTokens,
    outputTokens
  });

  concatUsage({
    usageId,
    teamId,
    itemType: type,
    totalPoints,
    inputTokens,
    outputTokens
  });

  return { totalPoints };
};

/* Create usage, and return usageId */
// Chat
export const createChatUsageRecord = async ({
  appName,
  appId,
  pluginId,
  teamId,
  tmbId,
  source
}: {
  appName: string;
  appId?: string;
  pluginId?: string;
  teamId: string;
  tmbId: string;
  source: UsageSourceEnum;
}) => {
  const [{ _id: usageId }] = await MongoUsage.create(
    [
      {
        teamId,
        tmbId,
        appId,
        pluginId,
        appName,
        source,
        totalPoints: 0
      }
    ],
    { ordered: true }
  );
  return String(usageId);
};

export const pushChatItemUsage = ({
  teamId,
  usageId,
  nodeUsages
}: {
  teamId: string;
  usageId: string;
  nodeUsages: ChatNodeUsageType[];
}) => {
  pushUsageItems({
    teamId,
    usageId,
    list: nodeUsages.map((item) => ({
      moduleName: item.moduleName,
      amount: item.totalPoints,
      model: item.model,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens
    }))
  });
};

export const createTrainingUsage = async ({
  teamId,
  tmbId,
  appName,
  billSource,
  vectorModel,
  agentModel,
  vllmModel,
  rerankModel,
  session
}: {
  teamId: string;
  tmbId: string;
  appName: string;
  billSource: UsageSourceEnum;
  vectorModel: string;
  agentModel?: string;
  vllmModel?: string;
  rerankModel?: string;
  session?: ClientSession;
}) => {
  const create = async (session: ClientSession) => {
    const [result] = await MongoUsage.create(
      [
        {
          teamId,
          tmbId,
          source: billSource,
          appName,
          totalPoints: 0
        }
      ],
      { session, ordered: true }
    );
    await MongoUsageItem.create(
      [
        {
          teamId,
          usageId: result._id,
          itemType: UsageItemTypeEnum.training_vector,
          name: i18nT('account_usage:embedding_index'),
          model: vectorModel,
          amount: 0,
          inputTokens: 0
        },
        ...(agentModel
          ? [
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_paragraph,
                name: i18nT('account_usage:llm_paragraph'),
                model: agentModel,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              },
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_qa,
                name: i18nT('account_usage:qa'),
                model: agentModel,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              },
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_autoIndex,
                name: i18nT('account_usage:auto_index'),
                model: agentModel,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
                },
                {
                  moduleName: i18nT('account_usage:synthesis'),
                  model: agentModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
              }
            ]
          : []),
        ...(vllmModel
          ? [
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_imageIndex,
                name: i18nT('account_usage:image_index'),
                model: vllmModel,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              },
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_imageParse,
                name: i18nT('account_usage:image_parse'),
                model: vllmModel,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              }
            ]
            : []),
          ...(vectorModel && agentModel
            ? [
                {
                  teamId,
                  usageId: result._id,
                  itemType: UsageItemTypeEnum.training_hypeIndex,
                  moduleName: i18nT('account_usage:hype_index'),
                  model: vectorModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                },
                {
                  teamId,
                  usageId: result._id,
                  itemType: UsageItemTypeEnum.training_hypeIndex,
                  moduleName: i18nT('account_usage:hype_index'),
                  model: agentModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                }
              ]
            : []),
          ...(rerankModel
            ? [
                {
                  teamId,
                  usageId: result._id,
                  itemType: UsageItemTypeEnum.training_hypeIndex,
                  moduleName: i18nT('account_usage:hype_index'),
                  model: rerankModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                }
              ]
          : [])
      ],
      {
        session,
        ordered: true
      }
    );

    return { usageId: String(result._id) };
  };
  if (session) return create(session);
  return mongoSessionRun(create);
};

export const createEvaluationUsage = async ({
  teamId,
  tmbId,
  appName,
  model
}: {
  teamId: string;
  tmbId: string;
  appName: string;
  model: string;
}) => {
  return mongoSessionRun(async (session) => {
    const [result] = await MongoUsage.create(
      [
        {
          teamId,
          tmbId,
          appName,
          source: UsageSourceEnum.evaluation,
          totalPoints: 0
        }
      ],
      { session, ordered: true }
    );
    await MongoUsageItem.create(
      [
        {
          teamId,
          usageId: result._id,
          itemType: UsageItemTypeEnum.evaluation_generateAnswer,
          name: i18nT('account_usage:generate_answer'),
          model,
          amount: 0,
          inputTokens: 0,
          outputTokens: 0
        },
        {
          teamId,
          usageId: result._id,
          itemType: UsageItemTypeEnum.evaluation_metricsExecute,
          name: i18nT('account_usage:metrics_execute'),
          model,
          amount: 0,
          inputTokens: 0,
          outputTokens: 0
        },
        {
          teamId,
          usageId: result._id,
          itemType: UsageItemTypeEnum.evaluation_summaryGeneration,
          name: i18nT('account_usage:evaluation_summary_generation'),
          model,
          amount: 0,
          inputTokens: 0,
          outputTokens: 0
        }
      ],
      { session, ordered: true }
    );

    return { usageId: String(result._id) };
  });
};

export const createEvalDatasetDataQualityUsage = async ({
  teamId,
  tmbId,
  model,
  usages
}: {
  teamId: string;
  tmbId: string;
  model: string;
  usages: Array<{
    promptTokens?: number;
    completionTokens?: number;
  }>;
}) => {
  let totalPoints = 0;
  const usageList = usages.map((usage) => {
    const { totalPoints: points } = formatModelChars2Points({
      model,
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0
    });
    totalPoints += points;

    return {
      moduleName: i18nT('account_usage:evaluation_quality_assessment'),
      amount: points,
      model,
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0
    };
  });

  await createUsage({
    teamId,
    tmbId,
    appName: i18nT('account_usage:evaluation_dataset_data_quality_assessment'),
    totalPoints,
    source: UsageSourceEnum.evaluation,
    list: usageList
  });

  return { totalPoints };
};

export const createEvalDatasetDataSynthesisUsage = async ({
  teamId,
  tmbId,
  model,
  usages
}: {
  teamId: string;
  tmbId: string;
  model: string;
  usages: Array<{
    promptTokens?: number;
    completionTokens?: number;
  }>;
}) => {
  let totalPoints = 0;
  const usageList = usages.map((usage) => {
    const { totalPoints: points } = formatModelChars2Points({
      model,
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0
    });
    totalPoints += points;

    return {
      moduleName: i18nT('account_usage:evaluation_dataset_data_qa_synthesis'),
      amount: points,
      model,
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0
    };
  });

  await createUsage({
    teamId,
    tmbId,
    appName: i18nT('account_usage:evaluation_dataset_data_synthesis'),
    totalPoints,
    source: UsageSourceEnum.evaluation,
    list: usageList
  });

  return { totalPoints };
};

export const createEvaluationMetricDebugUsage = async ({
  teamId,
  tmbId,
  metricName,
  totalPoints,
  model,
  inputTokens,
  outputTokens
}: {
  teamId: string;
  tmbId: string;
  metricName: string;
  totalPoints: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
}) => {
  if (totalPoints <= 0) {
    return;
  }

  await createUsage({
    teamId,
    tmbId,
    appName: i18nT('account_usage:evaluation_debug_metric'),
    totalPoints,
    source: UsageSourceEnum.evaluation,
    list: [
      {
        moduleName: `Debug: ${metricName}`,
        amount: totalPoints,
        model,
        inputTokens,
        outputTokens
      }
    ]
  });
};
