import { isDeepStrictEqual } from 'node:util';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { PriceTypeSchema, type PriceType } from '@fastgpt/global/core/ai/model/schema';
import {
  getRuntimeResolvedPriceTiers,
  roundModelPricing
} from '@fastgpt/global/core/ai/model/pricing';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { incrementModelCatalogRevision } from '@fastgpt/service/core/ai/model/catalog/entity';
import { convertModelPricingToMillion } from './utils';

const quantityModelTypes = [
  ModelTypeEnum.llm,
  ModelTypeEnum.embedding,
  ModelTypeEnum.rerank,
  ModelTypeEnum.tts
];
const priceKeys = ['priceTiers', 'inputPrice', 'outputPrice', 'charsPointsPrice'] as const;
export type TokenPriceMigrationRecord = PriceType & {
  _id: Types.ObjectId;
  type: ModelTypeEnum;
  scope: ModelScopeEnum;
  teamId?: Types.ObjectId;
  legacyTokenPricing?: PriceType;
};
export type TokenPriceMigrationError = { id: string; reason: string };
const projection = {
  _id: 1,
  type: 1,
  scope: 1,
  teamId: 1,
  legacyTokenPricing: 1,
  ...Object.fromEntries(priceKeys.map((key) => [key, 1]))
};

/** 固定全模型扫描上界；Token/TTS 转换为百万单位，STT 只遍历、不改价。 */
export const getTokenPriceMigrationSnapshot = async () => {
  const [last] = await MongoAIModel.collection
    .find({}, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .toArray();
  return {
    endId: last ? String(last._id) : null,
    total: last ? await MongoAIModel.collection.countDocuments({ _id: { $lte: last._id } }) : 0
  };
};

/** 稳定 ObjectId 分批读取，只读取固定扫描上界内的模型。 */
export const readTokenPriceMigrationBatch = async ({
  lastId,
  endId,
  limit
}: {
  lastId?: string | null;
  endId?: string | null;
  limit: number;
}) =>
  MongoAIModel.collection
    .find(
      {
        _id: {
          ...(lastId ? { $gt: new Types.ObjectId(lastId) } : {}),
          $lte: new Types.ObjectId(endId!)
        }
      },
      { projection }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray() as unknown as Promise<TokenPriceMigrationRecord[]>;

/** 校验全部源价格后换算并四舍五入至两位；保留精确区间边界。 */
const planTokenPriceMigration = (record: TokenPriceMigrationRecord) => {
  if (!quantityModelTypes.includes(record.type)) throw new Error('Unsupported model type');
  const parsed = PriceTypeSchema.safeParse(record);
  if (!parsed.success) throw new Error('Invalid model price fields');
  if (
    record.scope !== ModelScopeEnum.system &&
    (record.scope !== ModelScopeEnum.team ||
      !record.teamId ||
      !Types.ObjectId.isValid(record.teamId))
  ) {
    throw new Error('Invalid model catalog scope');
  }
  const prices = [
    record.inputPrice,
    record.outputPrice,
    record.charsPointsPrice,
    ...(record.priceTiers ?? []).flatMap((tier) => [tier.inputPrice, tier.outputPrice])
  ];
  if (prices.some((price) => price !== undefined && price < 0))
    throw new Error('Negative model price');

  const source = Object.fromEntries(
    priceKeys.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]])
  ) as PriceType;
  const migrated = Object.hasOwn(record, 'legacyTokenPricing');
  if (migrated && !PriceTypeSchema.safeParse(record.legacyTokenPricing).success)
    throw new Error('Invalid original model price backup');

  const pricing =
    record.type === ModelTypeEnum.llm && !migrated
      ? {
          ...source,
          priceTiers: getRuntimeResolvedPriceTiers(source).map(({ maxInputTokens, ...tier }) =>
            maxInputTokens === undefined ? tier : { ...tier, maxInputTokens }
          )
        }
      : source;
  const target = migrated ? source : roundModelPricing(convertModelPricingToMillion(pricing));
  if (!PriceTypeSchema.safeParse(target).success)
    throw new Error('Converted model price is not finite');
  return { source, target, migrated };
};

/**
 * 在事务中按源值 CAS 转换一批模型并递增目录修订号；旧价备份与新价格原子保存。
 * 旧价备份同时证明本条已提交；重放时不再换算，并发修改使整批回滚后重读。
 */
export const migrateTokenPricesBatch = async (records: TokenPriceMigrationRecord[]) => {
  const errors: TokenPriceMigrationError[] = [];
  const plans: Array<{ record: TokenPriceMigrationRecord; source: PriceType; target: PriceType }> =
    [];
  for (const record of records) {
    if (record.type === ModelTypeEnum.stt) continue;
    try {
      const plan = planTokenPriceMigration(record);
      if (!plan.migrated) plans.push({ record, ...plan });
    } catch (error) {
      errors.push({
        id: String(record._id),
        reason: error instanceof Error ? error.message : 'Invalid model pricing'
      });
    }
  }
  if (errors.length > 0 || plans.length === 0) return { errors };

  await mongoSessionRun(async (session) => {
    const result = await MongoAIModel.collection.bulkWrite(
      plans.map(({ record, source, target }) => ({
        updateOne: {
          filter: {
            _id: record._id,
            type: record.type,
            legacyTokenPricing: { $exists: false },
            scope: record.scope,
            teamId: Object.hasOwn(record, 'teamId') ? record.teamId : { $exists: false },
            ...Object.fromEntries(
              priceKeys.map((key) => [
                key,
                Object.hasOwn(record, key) ? record[key] : { $exists: false }
              ])
            )
          },
          update: { $set: { ...target, legacyTokenPricing: source } }
        }
      })),
      { session, ordered: true }
    );
    if (result.matchedCount !== plans.length)
      throw new Error('Model pricing changed concurrently; retry migration');

    const scopes = new Map(
      plans.map(({ record }) => [
        record.scope === ModelScopeEnum.system ? 'system' : String(record.teamId),
        record
      ])
    );
    for (const record of scopes.values()) {
      await incrementModelCatalogRevision(
        record.scope === ModelScopeEnum.system
          ? { scope: ModelScopeEnum.system }
          : { scope: ModelScopeEnum.team, teamId: String(record.teamId) },
        session
      );
    }
    const saved = await MongoAIModel.collection
      .find({ _id: { $in: plans.map(({ record }) => record._id) } }, { projection, session })
      .toArray();
    for (const { record, target, source } of plans) {
      const row = saved.find((doc) => String(doc._id) === String(record._id));
      if (
        !row ||
        !isDeepStrictEqual(PriceTypeSchema.parse(row), PriceTypeSchema.parse(target)) ||
        !isDeepStrictEqual(row.legacyTokenPricing, source)
      ) {
        throw new Error('Model price migration verification failed');
      }
    }
  });
  return { errors };
};

/** 最终只读校验：坏价格或未转换的文档均不得将迁移标记成功。 */
export const validateTokenPricesBatch = (records: TokenPriceMigrationRecord[]) => {
  const errors: TokenPriceMigrationError[] = [];
  for (const record of records) {
    if (record.type === ModelTypeEnum.stt) continue;
    try {
      const { migrated } = planTokenPriceMigration(record);
      if (!migrated) throw new Error('Model token price has not been converted');
    } catch (error) {
      errors.push({
        id: String(record._id),
        reason: error instanceof Error ? error.message : 'Invalid model pricing'
      });
    }
  }
  return errors;
};
