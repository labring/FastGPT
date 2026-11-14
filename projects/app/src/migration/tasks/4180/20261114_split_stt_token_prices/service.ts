import { Types } from '@fastgpt/service/common/mongo';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { z } from 'zod';
import { runModelTransaction } from '@fastgpt/service/core/ai/model/catalog/transaction';
import type { ModelCatalogScope } from '@fastgpt/service/core/ai/model/catalog/entity';

// 冻结迁移契约；保留旧字段供审计，不依赖未来业务 Schema。
const PricingSchema = z.object({
  type: z.literal('tokens'),
  unitPrice: z.number().nonnegative().optional(),
  inputPrice: z.number().nonnegative().optional(),
  outputPrice: z.number().nonnegative().optional()
});

/**
 * 旧综合 Tokens 单价分别回填为输入和输出单价，保持原定价水平；0 也必须回填。
 * 任意一侧已有新配置即不覆盖，未配置的一侧保持免费。事务重读保护并发编辑，
 * 模型与目录修订号原子提交；保留旧 unitPrice，但运行期只读取新的两个单价。
 */
export const splitSTTTokenPricesRecord = async (id: string) => {
  const collection = MongoAIModel.collection;
  const filter = { _id: new Types.ObjectId(id), type: ModelTypeEnum.stt, 'pricing.type': 'tokens' };
  const needsSplit = (pricing: unknown) => {
    const value = PricingSchema.parse(pricing);
    return (
      value.inputPrice === undefined &&
      value.outputPrice === undefined &&
      value.unitPrice !== undefined
    );
  };
  const raw = await collection.findOne(filter);
  if (!raw || !needsSplit(raw.pricing)) return;
  const scope: ModelCatalogScope = (() => {
    if (raw.scope === ModelScopeEnum.system) return { scope: ModelScopeEnum.system };
    if (raw.scope === ModelScopeEnum.team && Types.ObjectId.isValid(String(raw.teamId)))
      return { scope: ModelScopeEnum.team, teamId: String(raw.teamId) };
    throw new Error('Invalid STT model scope');
  })();
  await runModelTransaction(scope, async (session) => {
    const current = await collection.findOne(filter, { session });
    if (!current || !needsSplit(current.pricing)) return;
    if (current.scope !== raw.scope || String(current.teamId) !== String(raw.teamId))
      throw new Error('STT model scope changed during migration');
    const { unitPrice } = PricingSchema.parse(current.pricing);
    const updated = await collection.updateOne(
      { ...filter, pricing: current.pricing },
      { $set: { 'pricing.inputPrice': unitPrice, 'pricing.outputPrice': unitPrice } },
      { session }
    );
    if (updated.matchedCount !== 1) throw new Error('STT pricing changed during migration');
    const after = await collection.findOne(filter, { session, projection: { pricing: 1 } });
    const pricing = PricingSchema.parse(after?.pricing);
    if (pricing.inputPrice !== unitPrice || pricing.outputPrice !== unitPrice)
      throw new Error('STT token price split validation failed');
  });
};
