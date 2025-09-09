import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { MongoUsage } from './schema';
import { type ClientSession } from '../../../common/mongo';
import { addLog } from '../../../common/system/log';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import {
  type ConcatUsageProps,
  type CreateUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import { i18nT } from '../../../../web/i18n/utils';
import { formatModelChars2Points } from './utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';

export async function createUsage(data: CreateUsageProps) {
  try {
    await global.createUsageHandler(data);
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

export const createChatUsage = ({
  appName,
  appId,
  pluginId,
  teamId,
  tmbId,
  source,
  flowUsages
}: {
  appName: string;
  appId?: string;
  pluginId?: string;
  teamId: string;
  tmbId: string;
  source: UsageSourceEnum;
  flowUsages: ChatNodeUsageType[];
}) => {
  const totalPoints = flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  createUsage({
    teamId,
    tmbId,
    appName,
    appId,
    pluginId,
    totalPoints,
    source,
    list: flowUsages.map((item) => ({
      moduleName: item.moduleName,
      amount: item.totalPoints || 0,
      model: item.model,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens
    }))
  });
  addLog.debug(`Create chat usage`, {
    source,
    teamId,
    totalPoints
  });
  return { totalPoints };
};

export type DatasetTrainingMode = 'paragraph' | 'qa' | 'autoIndex' | 'imageIndex' | 'imageParse';
export const datasetTrainingUsageIndexMap: Record<DatasetTrainingMode, number> = {
  paragraph: 1,
  qa: 2,
  autoIndex: 3,
  imageIndex: 4,
  imageParse: 5
};
export const createTrainingUsage = async ({
  teamId,
  tmbId,
  appName,
  billSource,
  vectorModel,
  agentModel,
  vllmModel,
  session
}: {
  teamId: string;
  tmbId: string;
  appName: string;
  billSource: UsageSourceEnum;
  vectorModel?: string;
  agentModel?: string;
  vllmModel?: string;
  session?: ClientSession;
}) => {
  const [{ _id }] = await MongoUsage.create(
    [
      {
        teamId,
        tmbId,
        appName,
        source: billSource,
        totalPoints: 0,
        list: [
          ...(vectorModel
            ? [
                {
                  moduleName: i18nT('account_usage:embedding_index'),
                  model: vectorModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                }
              ]
            : []),
          ...(agentModel
            ? [
                {
                  moduleName: i18nT('account_usage:llm_paragraph'),
                  model: agentModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                },
                {
                  moduleName: i18nT('account_usage:qa'),
                  model: agentModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                },
                {
                  moduleName: i18nT('account_usage:auto_index'),
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
                  moduleName: i18nT('account_usage:image_index'),
                  model: vllmModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                },
                {
                  moduleName: i18nT('account_usage:image_parse'),
                  model: vllmModel,
                  amount: 0,
                  inputTokens: 0,
                  outputTokens: 0
                }
              ]
            : [])
        ]
      }
    ],
    { session, ordered: true }
  );

  return { billId: String(_id) };
};

export const createPdfParseUsage = async ({
  teamId,
  tmbId,
  pages
}: {
  teamId: string;
  tmbId: string;
  pages: number;
}) => {
  const unitPrice = global.systemEnv?.customPdfParse?.price || 0;
  const totalPoints = pages * unitPrice;

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
};

export const pushLLMTrainingUsage = async ({
  teamId,
  tmbId,
  model,
  inputTokens,
  outputTokens,
  billId,
  mode
}: {
  teamId: string;
  tmbId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  billId: string;
  mode: DatasetTrainingMode;
}) => {
  const index = datasetTrainingUsageIndexMap[mode];

  // Compute points
  const { totalPoints } = formatModelChars2Points({
    model,
    modelType: ModelTypeEnum.llm,
    inputTokens,
    outputTokens
  });

  concatUsage({
    billId,
    teamId,
    tmbId,
    totalPoints,
    inputTokens,
    outputTokens,
    listIndex: index
  });

  return { totalPoints };
};

// Evaluation usage index mapping for better maintenance
export const evaluationUsageIndexMap = {
  target: 0, // 生成应用回答
  metric: 1, // 指标执行评测
  summary: 2 // 生成总结报告
} as const;

export const createEvaluationUsage = async ({
  teamId,
  tmbId,
  appName,
  session
}: {
  teamId: string;
  tmbId: string;
  appName: string;
  session?: ClientSession;
}) => {
  const [{ _id }] = await MongoUsage.create(
    [
      {
        teamId,
        tmbId,
        appName,
        source: UsageSourceEnum.evaluation,
        totalPoints: 0,
        list: [
          {
            moduleName: i18nT('account_usage:generate_answer'),
            amount: 0,
            count: 0
          },
          {
            moduleName: i18nT('account_usage:metrics_execute'),
            amount: 0,
            inputTokens: 0,
            outputTokens: 0
          },
          {
            moduleName: i18nT('account_usage:evaluation_summary_generation'),
            amount: 0,
            inputTokens: 0,
            outputTokens: 0
          }
        ]
      }
    ],
    { session, ordered: true }
  );

  return { billId: String(_id) };
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
      modelType: ModelTypeEnum.llm,
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
      modelType: ModelTypeEnum.llm,
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
