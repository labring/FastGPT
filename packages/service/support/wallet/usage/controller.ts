import { runInTransaction } from '@fastgpt/dal/db/transaction';
import type { DbSession } from '@fastgpt/dal/db/types';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { AIModelDataType, STTModelDataType } from '@fastgpt/global/core/ai/model/schema';
import {
  STTBillableUsageSchema,
  type STTBillableUsageType
} from '@fastgpt/global/core/ai/audio/type';
import { calculateModelPrice, resolveSTTPricing } from '@fastgpt/global/core/ai/model/pricing';
import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type {
  ConcatUsageProps,
  CreateUsageProps,
  PushUsageItemsProps
} from '@fastgpt/global/support/wallet/usage/api';
import { UsageItemTypeEnum, UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLogger, LogCategories } from '../../../common/logger';
import { bridgeDbSessionToClientSession, mongoSessionRun } from '../../../common/mongo/sessionRun';
import { getSystemInstanceConfig } from '../../../common/system/systemInstanceConfig/runtime';
import { MongoUsage } from './schema';
import { MongoUsageItem } from './usageItemSchema';
import { formatModelChars2Points } from './utils';

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
  const unitPrice = getSystemInstanceConfig().providers.documentParse.customPdf.price;
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
  cacheReadTokens,
  cacheCreationTokens,
  usageId,
  type
}: {
  teamId: string;
  model: AIModelDataType;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  usageId: string;
  type: UsageItemTypeEnum;
}) => {
  // Compute points
  const { modelId, totalPoints } = formatModelChars2Points({
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens
  });

  concatUsage({
    usageId,
    teamId,
    itemType: type,
    modelId,
    totalPoints,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens
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
      cacheReadTokens: item.cacheReadTokens,
      cacheCreationTokens: item.cacheCreationTokens,
      pages: item.pages
    }))
  });
};

/**
 * 使用本次实际模型及明确的秒数/Tokens 用量生成账单，不重新查询默认模型。
 * 价格类型与用量不一致属于内部错误；上游缺失用量应由适配器转为同口径的 0。
 * 明细只记录本次计费用量与金额，不重复保存价格；即使数量为 0 也保留所选用量字段。
 */
export const pushSTTUsage = async ({
  teamId,
  tmbId,
  model,
  usage,
  source
}: {
  teamId: string;
  tmbId: string;
  model: STTModelDataType;
  usage: STTBillableUsageType;
  source: UsageSourceEnum;
}) => {
  const pricing = resolveSTTPricing(model.pricing);
  const billableUsage = STTBillableUsageSchema.parse(usage);
  if (pricing.type !== billableUsage.type)
    throw new Error('STT pricing and usage types do not match');
  const { totalPoints } = calculateModelPrice({ config: model, sttUsage: billableUsage });

  const name = i18nT('common:support.wallet.usage.Whisper');

  await createUsage({
    teamId,
    tmbId,
    appName: name,
    totalPoints,
    source,
    list: [
      {
        moduleName: name,
        amount: totalPoints,
        modelId: model.modelId,
        ...(billableUsage.type === 'duration'
          ? { duration: billableUsage.seconds }
          : { inputTokens: billableUsage.inputTokens, outputTokens: billableUsage.outputTokens })
      }
    ]
  });
};

type TrainingUsageModelIds = {
  vectorModelId: string;
  agentModelId?: string;
  vllmModelId?: string;
};

const trainingUsageItemNames = {
  [UsageItemTypeEnum.training_vector]: i18nT('account_usage:embedding_index'),
  [UsageItemTypeEnum.training_paragraph]: i18nT('account_usage:llm_paragraph'),
  [UsageItemTypeEnum.training_qa]: i18nT('account_usage:qa'),
  [UsageItemTypeEnum.training_autoIndex]: i18nT('account_usage:auto_index'),
  [UsageItemTypeEnum.training_imageIndex]: i18nT('account_usage:image_index'),
  [UsageItemTypeEnum.training_imageParse]: i18nT('account_usage:image_parse')
};

/** 复用账单的 Mongo 版本号串行化明细补齐和计费，零积分写入也占同一把锁。 */
export const buildTrainingUsageBillIncrement = (totalPoints: number) => ({
  $inc: { totalPoints, __v: 1 }
});

/** 累加实际模型的明细。模型可以在建单后变更，因此允许在同一账单内按需创建明细。 */
export const buildUsageItemIncrement = ({
  teamId,
  usageId,
  itemType,
  modelId,
  totalPoints,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
  charsLength,
  duration,
  pages,
  count
}: ConcatUsageProps) => {
  const names: Partial<Record<UsageItemTypeEnum, string>> = trainingUsageItemNames;
  const name = modelId ? names[itemType] : undefined;

  return {
    filter: { teamId, usageId, itemType, ...(name && { modelId }) },
    update: {
      ...(name && { $setOnInsert: { name } }),
      $inc: {
        amount: totalPoints,
        ...(inputTokens !== undefined && { inputTokens }),
        ...(outputTokens !== undefined && { outputTokens }),
        ...(cacheReadTokens !== undefined && { cacheReadTokens }),
        ...(cacheCreationTokens !== undefined && { cacheCreationTokens }),
        ...(charsLength && { charsLength }),
        ...(duration && { duration }),
        ...(pages && { pages }),
        ...(count && { count })
      }
    },
    upsert: name !== undefined
  };
};

/** 统一业务建单、补齐明细和历史迁移的训练计费项。 */
export const getTrainingUsageItems = ({
  teamId,
  usageId,
  vectorModelId,
  agentModelId,
  vllmModelId
}: TrainingUsageModelIds & { teamId: string; usageId: string }) => [
  {
    teamId,
    usageId,
    itemType: UsageItemTypeEnum.training_vector,
    name: trainingUsageItemNames[UsageItemTypeEnum.training_vector],
    modelId: vectorModelId,
    amount: 0,
    inputTokens: 0
  },
  ...(agentModelId
    ? [
        {
          teamId,
          usageId,
          itemType: UsageItemTypeEnum.training_paragraph,
          name: trainingUsageItemNames[UsageItemTypeEnum.training_paragraph],
          modelId: agentModelId,
          amount: 0,
          inputTokens: 0,
          outputTokens: 0
        },
        {
          teamId,
          usageId,
          itemType: UsageItemTypeEnum.training_qa,
          name: trainingUsageItemNames[UsageItemTypeEnum.training_qa],
          modelId: agentModelId,
          amount: 0,
          inputTokens: 0,
          outputTokens: 0
        },
        {
          teamId,
          usageId,
          itemType: UsageItemTypeEnum.training_autoIndex,
          name: trainingUsageItemNames[UsageItemTypeEnum.training_autoIndex],
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
          usageId,
          itemType: UsageItemTypeEnum.training_imageIndex,
          name: trainingUsageItemNames[UsageItemTypeEnum.training_imageIndex],
          modelId: vllmModelId,
          amount: 0,
          inputTokens: 0,
          outputTokens: 0
        },
        {
          teamId,
          usageId,
          itemType: UsageItemTypeEnum.training_imageParse,
          name: trainingUsageItemNames[UsageItemTypeEnum.training_imageParse],
          modelId: vllmModelId,
          amount: 0,
          inputTokens: 0,
          outputTokens: 0
        }
      ]
    : [])
];

export const createTrainingUsage = async ({
  teamId,
  tmbId,
  appName,
  billSource,
  trainingCollectionId,
  vectorModelId,
  agentModelId,
  vllmModelId,
  tx
}: {
  teamId: string;
  tmbId: string;
  appName: string;
  billSource: UsageSourceEnum;
  trainingCollectionId?: string;

  vectorModelId: string;
  agentModelId?: string;
  vllmModelId?: string;
  tx?: DbSession;
}): Promise<{ usageId: string }> => {
  const create = async (tx: DbSession) => {
    const session = bridgeDbSessionToClientSession(tx);
    const [result] = await MongoUsage.create(
      [
        {
          teamId,
          tmbId,
          source: billSource,
          appName,
          ...(trainingCollectionId && { trainingCollectionId }),
          totalPoints: 0
        }
      ],
      { session, ordered: true }
    );
    await MongoUsageItem.create(
      getTrainingUsageItems({
        teamId,
        usageId: String(result._id),
        vectorModelId,
        agentModelId,
        vllmModelId
      }),
      { session, ordered: true }
    );

    return { usageId: String(result._id) };
  };
  return tx ? create(tx) : runInTransaction(create, { dialect: 'mongo' });
};

/** 批量建立文档训练账单，明细和账户由调用方事务一起提交。 */
export const createTrainingUsages = async (
  {
    teamId,
    tmbId,
    bills,
    ...models
  }: TrainingUsageModelIds & {
    teamId: string;
    tmbId: string;
    bills: { appName: string; trainingCollectionId: string }[];
  },
  tx?: DbSession
): Promise<string[]> => {
  if (bills.length === 0) return [];
  if (!tx) {
    return runInTransaction((tx) => createTrainingUsages({ teamId, tmbId, bills, ...models }, tx), {
      dialect: 'mongo'
    });
  }
  const session = bridgeDbSessionToClientSession(tx);
  const ids: string[] = [];
  const batchSize = 1000;

  for (let offset = 0; offset < bills.length; offset += batchSize) {
    const usages = await MongoUsage.insertMany(
      bills.slice(offset, offset + batchSize).map((bill) => ({
        ...bill,
        teamId,
        tmbId,
        source: UsageSourceEnum.training,
        totalPoints: 0
      })),
      { session, ordered: true }
    );
    const usageIds = usages.map(({ _id }) => String(_id));
    await MongoUsageItem.insertMany(
      usageIds.flatMap((usageId) => getTrainingUsageItems({ teamId, usageId, ...models })),
      { session, ordered: true }
    );
    ids.push(...usageIds);
  }

  return ids;
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
