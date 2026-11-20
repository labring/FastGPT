import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  incrementModelCatalogRevision,
  type ModelCatalogScope
} from '@fastgpt/service/core/ai/model/catalog/entity';
import { runModelTransaction } from '@fastgpt/service/core/ai/model/catalog/transaction';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { z } from 'zod';
import { systemMigrationBatchSize } from '@/migration/constants';
import {
  convertTierMaxInputTokensToK,
  MigratedTierListSchema,
  type MigrationPriceTier
} from './utils';

// 冻结 STT 迁移的最小价格契约，避免未来业务 Schema 改动影响断点重放。
const STTPricingSchema = z.object({
  type: z.enum(['duration', 'tokens']),
  unitPrice: z.number().nonnegative().optional()
});

const llmTierScopeFilter = {
  scope: ModelScopeEnum.system,
  type: ModelTypeEnum.llm,
  'pricing.tiers': { $exists: true }
};

const extractRawTiers = (pricing: unknown) => {
  const pricingObj =
    typeof pricing === 'object' && pricing !== null && !Array.isArray(pricing)
      ? (pricing as Record<string, unknown>)
      : undefined;
  return pricingObj?.tiers;
};

/**
 * 旧 STT 单价固定按分钟，仅补缺失的价格类型，不改金额或已配置的 Tokens 类型。
 * 事务重读保护并发编辑，模型与目录修订号原子提交；重放不会覆盖新配置。
 */
export const backfillSTTPricingTypeRecord = async (id: string) => {
  const collection = MongoAIModel.collection;
  const filter = { _id: new Types.ObjectId(id), type: ModelTypeEnum.stt };

  /** 迁移专用读取允许旧价格缺少 type；当前业务 Schema 仍要求明确类型。 */
  const needsBackfill = (pricing: unknown) => {
    if (pricing === undefined || pricing === null) return true;
    if (typeof pricing !== 'object' || Array.isArray(pricing))
      throw new Error('Invalid STT pricing object');
    const value = pricing as Record<string, unknown>;
    STTPricingSchema.parse({
      ...value,
      type: value.type === undefined ? 'duration' : value.type
    });
    return value.type === undefined;
  };

  const raw = await collection.findOne(filter);
  if (!raw || !needsBackfill(raw.pricing)) return;

  const scope: ModelCatalogScope = (() => {
    if (raw.scope === ModelScopeEnum.system) return { scope: ModelScopeEnum.system };
    if (raw.scope === ModelScopeEnum.team && Types.ObjectId.isValid(String(raw.teamId)))
      return { scope: ModelScopeEnum.team, teamId: String(raw.teamId) };
    throw new Error('Invalid STT model scope');
  })();

  await runModelTransaction(scope, async (session) => {
    const current = await collection.findOne(filter, { session });
    if (!current || !needsBackfill(current.pricing)) return;
    if (current.scope !== raw.scope || String(current.teamId) !== String(raw.teamId))
      throw new Error('STT model scope changed during migration');
    const updated = await collection.updateOne(
      { ...filter, pricing: current.pricing === undefined ? { $exists: false } : current.pricing },
      {
        $set:
          current.pricing === undefined || current.pricing === null
            ? { pricing: { type: 'duration' } }
            : { 'pricing.type': 'duration' }
      },
      { session }
    );
    if (updated.matchedCount !== 1) throw new Error('STT pricing changed during migration');
    const after = await collection.findOne(filter, { session, projection: { pricing: 1 } });
    STTPricingSchema.parse(after?.pricing);
  });
};

/**
 * 在单个快照事务内将系统 LLM 阶梯上限从 M Tokens 乘以 1000 并四舍五入为 K Tokens 正整数，
 * 同时递增系统模型目录修订号。
 */
export const migrateTierMaxInputTokensInTransaction = async ({
  signal,
  assertActive
}: {
  signal: AbortSignal;
  assertActive: () => Promise<void>;
}): Promise<{
  scannedCount: number;
  migratedCount: number;
  failures: SystemMigrationFailedRecord[];
}> => {
  let scannedCount = 0;
  const failures: SystemMigrationFailedRecord[] = [];

  const migratedCount = await mongoSessionRun(
    async (session) => {
      signal.throwIfAborted();
      const models = await MongoAIModel.collection
        .find(llmTierScopeFilter, {
          session,
          projection: { _id: 1, 'pricing.tiers': 1 }
        })
        .sort({ _id: 1 })
        .toArray();

      scannedCount = models.length;
      failures.length = 0;

      const updates: Array<{
        updateOne: {
          filter: Record<string, unknown>;
          update: { $set: { 'pricing.tiers': MigrationPriceTier[] } };
        };
      }> = [];

      for (const model of models) {
        const rawTiers = extractRawTiers(model.pricing);
        try {
          const { tiers, changed } = convertTierMaxInputTokensToK(rawTiers);
          if (!changed) continue;
          updates.push({
            updateOne: {
              filter: {
                _id: model._id,
                scope: ModelScopeEnum.system,
                type: ModelTypeEnum.llm,
                'pricing.tiers': rawTiers
              },
              update: { $set: { 'pricing.tiers': tiers } }
            }
          });
        } catch {
          failures.push({
            stageKey: 'llmTiers',
            data: { id: String(model._id) },
            reason: {
              message: 'Invalid LLM pricing tiers; repair before retrying'
            }
          });
        }
      }

      if (failures.length > 0 || updates.length === 0) {
        return 0;
      }

      await assertActive();
      const result = await MongoAIModel.collection.bulkWrite(updates, {
        session,
        ordered: true
      });
      if (result.matchedCount !== updates.length) {
        throw new Error('System model pricing tiers changed during migration');
      }
      await incrementModelCatalogRevision({ scope: ModelScopeEnum.system }, session);
      return result.modifiedCount;
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
  );

  return { scannedCount, migratedCount, failures };
};

/** 校验全集合 STT 价格均具备明确计价类型，覆盖扫描上界之后的新写入或篡改。 */
export const validateBackfilledSTTPricingTypes = async (): Promise<
  SystemMigrationFailedRecord[]
> => {
  const invalid = await MongoAIModel.collection
    .find(
      { type: ModelTypeEnum.stt, 'pricing.type': { $nin: ['duration', 'tokens'] } },
      { projection: { _id: 1 } }
    )
    .sort({ _id: 1 })
    .limit(systemMigrationBatchSize)
    .toArray();

  return invalid.map(({ _id }) => ({
    stageKey: 'validation',
    data: { id: String(_id) },
    reason: { message: 'STT pricing type is missing or invalid; repair before retrying' }
  }));
};

/** 校验全部系统 LLM 阶梯均合法且有限输入上限均为正整数 K Tokens（或 > 10 跳过项）。 */
export const validateMigratedTierMaxInputTokens = async (): Promise<
  SystemMigrationFailedRecord[]
> => {
  const persistedModels = await MongoAIModel.collection
    .find(llmTierScopeFilter, { projection: { _id: 1, 'pricing.tiers': 1 } })
    .sort({ _id: 1 })
    .toArray();
  const validationFailures: SystemMigrationFailedRecord[] = [];

  for (const model of persistedModels) {
    const id = String(model._id);
    const rawTiers = extractRawTiers(model.pricing);
    try {
      MigratedTierListSchema.parse(rawTiers);
    } catch {
      validationFailures.push({
        stageKey: 'validation',
        data: { id },
        reason: {
          message: 'Invalid LLM pricing tiers; repair before retrying'
        }
      });
    }
  }

  return validationFailures;
};
