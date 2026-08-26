import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { MongoUsage } from './schema';
import { type ClientSession } from '../../../common/mongo';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type {
  PushUsageItemsProps,
  ConcatUsageProps,
  CreateUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { formatModelChars2Points } from './utils';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoUsageItem } from './usageItemSchema';
import { getLogger, LogCategories } from '../../../common/logger';
import { getDefaultSTTModelData } from '../../../core/ai/model';

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
  model,
  inputTokens,
  outputTokens,
  usageId,
  type
}: {
  teamId: string;
  model: SystemModelDataType;
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
  skillId,
  pluginId,
  teamId,
  tmbId,
  source
}: {
  appName: string;
  appId?: string;
  skillId?: string;
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
        skillId,
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
      outputTokens: item.outputTokens,
      pages: item.pages
    }))
  });
};

/** 记录 STT 音频用量；source 由调用方显式指定，区分 API 与各 outLink 渠道。 */
export const pushWhisperUsage = ({
  teamId,
  tmbId,
  duration,
  source
}: {
  teamId: string;
  tmbId: string;
  duration: number;
  source: UsageSourceEnum;
}) => {
  const whisperModel = getDefaultSTTModelData();

  const { totalPoints, modelId } = formatModelChars2Points({
    model: whisperModel,
    inputTokens: duration,
    multiple: 60
  });

  const name = i18nT('common:support.wallet.usage.Whisper');

  createUsage({
    teamId,
    tmbId,
    appName: name,
    totalPoints,
    source,
    list: [
      {
        moduleName: name,
        amount: totalPoints,
        modelId,
        duration
      }
    ]
  });
};

// Dataset training
export const createTrainingUsage = async ({
  teamId,
  tmbId,
  appName,
  billSource,
  vectorModelId,
  agentModelId,
  vllmModelId,
  session
}: {
  teamId: string;
  tmbId: string;
  appName: string;
  billSource: UsageSourceEnum;

  vectorModelId: string;
  agentModelId?: string;
  vllmModelId?: string;
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

// Evaluation
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
  const { usageId } = await mongoSessionRun(async (session) => {
    const [{ _id: usageId }] = await MongoUsage.create(
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
          usageId,
          itemType: UsageItemTypeEnum.evaluation_generateAnswer,
          name: i18nT('account_usage:generate_answer'),
          amount: 0,
          count: 0
        },
        {
          teamId,
          usageId,
          itemType: UsageItemTypeEnum.evaluation_answerAccuracy,
          name: i18nT('account_usage:answer_accuracy'),
          amount: 0,
          inputTokens: 0,
          outputTokens: 0,
          modelId
        }
      ],
      {
        session,
        ordered: true
      }
    );

    return { usageId: String(usageId) };
  });

  return { usageId };
};
