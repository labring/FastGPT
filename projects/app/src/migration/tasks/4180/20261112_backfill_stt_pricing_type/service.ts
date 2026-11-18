import { Types } from '@fastgpt/service/common/mongo';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { z } from 'zod';
import { runModelTransaction } from '@fastgpt/service/core/ai/model/catalog/transaction';
import type { ModelCatalogScope } from '@fastgpt/service/core/ai/model/catalog/entity';

// 冻结本次迁移的最小价格契约，避免未来业务 Schema 改动影响断点重放。
const PricingSchema = z.object({
  type: z.enum(['duration', 'tokens']),
  unitPrice: z.number().nonnegative().optional()
});

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
    PricingSchema.parse({
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
    PricingSchema.parse(after?.pricing);
  });
};
