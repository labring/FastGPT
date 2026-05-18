import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { MongoUsage } from './schema';
import { type ClientSession } from '../../../common/mongo';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type {
  PushUsageItemsProps,
  ConcatUsageProps,
  CreateUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import { i18nT } from '../../../../global/common/i18n/utils';
import { formatModelChars2Points } from './utils';
import { getModelById } from '../../../core/ai/model';
import { MongoUsageItem } from './usageItemSchema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.WALLET.USAGE);

export async function createUsage(data: CreateUsageProps) {
  try {
    return await global.createUsageHandler(data);
  } catch (error) {
    logger.error('Failed to create usage', { error });
  }
}
export async function concatUsage(data: ConcatUsageProps) {
  try {
    await global.concatUsageHandler(data);
  } catch (error) {
    logger.error('Failed to concat usage', { error });
  }
}
export async function pushUsageItems(data: PushUsageItemsProps) {
  try {
    await global.pushUsageItemsHandler(data);
  } catch (error) {
    logger.error('Failed to push usage items', { error });
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
  modelId,
  inputTokens,
  outputTokens,
  usageId,
  type
}: {
  teamId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  usageId: string;
  type: UsageItemTypeEnum;
}) => {
  // Compute points
  const { totalPoints } = formatModelChars2Points({
    modelId,
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
      modelId: item.modelId,
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
  vectorModelId,
  agentModelId,
  vllmModelId,
  rerankModelId,
  session
}: {
  teamId: string;
  tmbId: string;
  appName: string;
  billSource: UsageSourceEnum;
  vectorModelId: string;
  agentModelId?: string;
  vllmModelId?: string;
  rerankModelId?: string;
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
          modelId: vectorModelId,
          amount: 0,
          inputTokens: 0
        },
        ...(agentModelId
          ? [
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_paragraph,
                name: i18nT('account_usage:llm_paragraph'),
                modelId: agentModelId,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              },
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_qa,
                name: i18nT('account_usage:qa'),
                modelId: agentModelId,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              },
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_autoIndex,
                name: i18nT('account_usage:auto_index'),
                modelId: agentModelId,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              }
            ]
          : []),
        ...(vllmModelId
          ? [
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_imageIndex,
                name: i18nT('account_usage:image_index'),
                modelId: vllmModelId,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              },
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_imageParse,
                name: i18nT('account_usage:image_parse'),
                modelId: vllmModelId,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              }
            ]
          : []),
        ...(vectorModelId && agentModelId
          ? [
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_hypeIndex,
                name: i18nT('account_usage:hype_index'),
                modelId: vectorModelId,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              },
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_hypeIndex,
                name: i18nT('account_usage:hype_index'),
                modelId: agentModelId,
                amount: 0,
                inputTokens: 0,
                outputTokens: 0
              }
            ]
          : []),
        ...(rerankModelId
          ? [
              {
                teamId,
                usageId: result._id,
                itemType: UsageItemTypeEnum.training_hypeIndex,
                name: i18nT('account_usage:hype_index'),
                modelId: rerankModelId,
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
  modelId
}: {
  teamId: string;
  tmbId: string;
  appName: string;
  modelId: string;
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
          modelId,
          amount: 0,
          inputTokens: 0,
          outputTokens: 0
        },
        {
          teamId,
          usageId: result._id,
          itemType: UsageItemTypeEnum.evaluation_metricsExecute,
          name: i18nT('account_usage:metrics_execute'),
          modelId,
          amount: 0,
          inputTokens: 0,
          outputTokens: 0
        },
        {
          teamId,
          usageId: result._id,
          itemType: UsageItemTypeEnum.evaluation_summaryGeneration,
          name: i18nT('account_usage:evaluation_summary_generation'),
          modelId,
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
  modelId,
  usages
}: {
  teamId: string;
  tmbId: string;
  modelId: string;
  usages: Array<{
    promptTokens?: number;
    completionTokens?: number;
  }>;
}) => {
  let totalPoints = 0;
  const usageList = usages.map((usage) => {
    const { totalPoints: points } = formatModelChars2Points({
      modelId,
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0
    });
    totalPoints += points;

    return {
      moduleName: i18nT('account_usage:evaluation_quality_assessment'),
      amount: points,
      modelId: modelId,
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
  modelId,
  usages
}: {
  teamId: string;
  tmbId: string;
  modelId: string;
  usages: Array<{
    promptTokens?: number;
    completionTokens?: number;
  }>;
}) => {
  let totalPoints = 0;
  const modelData = getModelById(modelId);
  const usageList = usages.map((usage) => {
    const { totalPoints: points } = formatModelChars2Points({
      modelId,
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0
    });
    totalPoints += points;

    return {
      moduleName: i18nT('account_usage:evaluation_dataset_data_qa_synthesis'),
      amount: points,
      modelId: modelId,
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
  modelId,
  inputTokens,
  outputTokens
}: {
  teamId: string;
  tmbId: string;
  metricName: string;
  totalPoints: number;
  modelId: string;
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
        modelId,
        inputTokens,
        outputTokens
      }
    ]
  });
};
