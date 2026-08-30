import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelDefaultIdsSchema, type ModelDefaultIds } from '@fastgpt/global/core/ai/defaultModel';
import type { ClientSession } from '../../../common/mongo';
import { MongoAIDefaultModel } from './schema';

/** 读取系统作用域配置；没有记录时返回空配置，由运行时按模型类型回退。 */
export const findSystemDefaultModelIds = async (): Promise<ModelDefaultIds> => {
  const document = await MongoAIDefaultModel.findOne({ scope: ModelScopeEnum.system }).lean();
  return document ? ModelDefaultIdsSchema.parse(document.defaultModelIds) : {};
};

/** 原子写入唯一的系统默认模型配置，并透传上层迁移事务。 */
export const upsertSystemDefaultModelIds = (
  defaultModelIds: ModelDefaultIds,
  session?: ClientSession
) =>
  MongoAIDefaultModel.findOneAndUpdate(
    { scope: ModelScopeEnum.system },
    {
      $set: { defaultModelIds },
      $setOnInsert: { scope: ModelScopeEnum.system }
    },
    { session, upsert: true }
  );
