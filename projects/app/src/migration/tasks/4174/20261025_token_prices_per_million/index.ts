import z from 'zod';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  LLMModelPricingSchema,
  UnitModelPricingSchema
} from '@fastgpt/global/core/ai/model/schema';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { incrementModelCatalogRevision } from '@fastgpt/service/core/ai/model/catalog/entity';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import type { SystemMigrationContext } from '@/migration/registry';
import { convertLegacyModelPricing } from './utils';

/**
 * 独立后台迁移：启动链已完成系统模型迁移后，一次读取全部系统模型并批量新增 pricing。
 * 原根级字段保持原值，计价转换不阻塞业务或其他后台队列。
 * 合法 pricing 已存在即跳过；写入再次检查字段缺失，保护重试和管理员并发修改。
 */
export const migrateTokenPricesPerMillion = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: 'models', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  const models = await MongoAIModel.collection
    .find(
      { scope: ModelScopeEnum.system },
      {
        projection: {
          type: 1,
          pricing: 1,
          priceTiers: 1,
          inputPrice: 1,
          outputPrice: 1,
          charsPointsPrice: 1
        }
      }
    )
    .toArray();

  // 所有转换先校验再写入，坏数据不会造成部分模型已迁移。
  const updates = models.flatMap((model) => {
    try {
      const type = z.nativeEnum(ModelTypeEnum).parse(model.type);
      if (Object.hasOwn(model, 'pricing')) {
        (type === ModelTypeEnum.llm ? LLMModelPricingSchema : UnitModelPricingSchema).parse(
          model.pricing
        );
        return [];
      }
      const pricing = convertLegacyModelPricing(model, type);
      return [
        {
          updateOne: {
            filter: { _id: model._id, scope: ModelScopeEnum.system, pricing: { $exists: false } },
            update: { $set: { pricing } }
          }
        }
      ];
    } catch (error) {
      throw new Error(
        `Invalid system model pricing: ${String(model._id)} (${model.model ?? model.type})`,
        { cause: error }
      );
    }
  });

  await context.assertActive();
  const migratedCount =
    updates.length === 0
      ? 0
      : await mongoSessionRun(async (session) => {
          const result = await MongoAIModel.collection.bulkWrite(updates, {
            session,
            ordered: true
          });
          if (result.modifiedCount > 0)
            await incrementModelCatalogRevision({ scope: ModelScopeEnum.system }, session);
          return result.modifiedCount;
        });
  await context.assertActive();
  await context.reportProgress({
    key: 'models',
    status: SystemMigrationStatusEnum.succeeded,
    current: migratedCount,
    total: models.length
  });
  return { migratedCount };
};
