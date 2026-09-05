import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { ClientSession } from '../../../common/mongo';
import { runSystemModelTransaction } from './entity';
import { MongoAIModel } from './schema';
import { updatedReloadSystemModel } from './utils';
import type { SystemModelSchemaType } from '../type';
import type { UpdateQuery } from 'mongoose';

type EditableSystemModelData = Omit<SystemModelDocumentDataType, 'model'>;

const optionalSystemModelConfigFields = [
  'requestUrl',
  'requestAuth',
  'testMode',
  'charsPointsPrice',
  'priceTiers',
  'inputPrice',
  'outputPrice'
] as const;

/**
 * 生成模型配置的替换式更新表达式。
 *
 * `model`、`type` 与 `scope` 都是实例身份的一部分，不参与 `$set`；已知可选字段缺失时
 * 使用 `$unset`，避免普通 `$set` 让旧价格或旧请求配置残留。
 */
export const getSystemModelConfigUpdate = (
  modelData: EditableSystemModelData
): UpdateQuery<SystemModelSchemaType> => {
  const mutableModelData = { ...modelData } as Record<string, unknown>;
  delete mutableModelData.type;
  delete mutableModelData.scope;

  const fieldsToUnset = optionalSystemModelConfigFields.filter((field) => {
    const value = mutableModelData[field];
    const isEmptyRequestConfig =
      (field === 'requestUrl' || field === 'requestAuth') &&
      typeof value === 'string' &&
      value.trim().length === 0;

    if (!(field in mutableModelData) || value === undefined || isEmptyRequestConfig) {
      delete mutableModelData[field];
      return true;
    }
    return false;
  });

  return {
    $set: mutableModelData,
    ...(fieldsToUnset.length > 0
      ? {
          $unset: Object.fromEntries(fieldsToUnset.map((field) => [field, 1 as const])) as Record<
            string,
            1
          >
        }
      : {})
  } as UpdateQuery<SystemModelSchemaType>;
};

/**
 * 更新一组已存在的系统模型，并保证目标集合完整命中。
 *
 * 该内部入口集中 system scope 和“不允许部分命中”的业务规则；是否开启事务由上层操作决定。
 */
const updateExistingSystemModels = async ({
  modelIds,
  update,
  session
}: {
  modelIds: string[];
  update: EditableSystemModelData | Pick<SystemModelDocumentDataType, 'isActive'>;
  session?: ClientSession;
}) => {
  const result = await MongoAIModel.updateMany(
    { _id: { $in: modelIds }, scope: ModelScopeEnum.system },
    { $set: update },
    { session }
  );

  if (result.matchedCount !== modelIds.length) {
    return Promise.reject(ModelErrEnum.unExist);
  }
};

/** 按稳定 modelId 更新单个系统模型的可编辑配置，并刷新运行时模型快照。 */
export const updateSystemModelConfig = async ({
  modelId,
  modelData
}: {
  modelId: string;
  modelData: EditableSystemModelData;
}) => {
  await runSystemModelTransaction(async (session) => {
    const existingModel = await MongoAIModel.findOne(
      { _id: modelId, scope: ModelScopeEnum.system },
      { type: 1 }
    )
      .session(session)
      .lean();
    if (!existingModel) throw ModelErrEnum.unExist;
    if (existingModel.type !== modelData.type) {
      throw new UserError('System model type cannot be changed');
    }

    const result = await MongoAIModel.updateOne(
      { _id: modelId, scope: ModelScopeEnum.system, type: existingModel.type },
      getSystemModelConfigUpdate(modelData),
      { session }
    );
    if (result.matchedCount !== 1) throw ModelErrEnum.unExist;
  });
  await updatedReloadSystemModel();
};

/** 在单个 MongoDB 事务中批量更新系统模型启停状态，并刷新运行时模型快照。 */
export const updateSystemModelStatus = async ({
  modelIds,
  isActive
}: {
  modelIds: string[];
  isActive: boolean;
}) => {
  await runSystemModelTransaction((session) =>
    updateExistingSystemModels({ modelIds, update: { isActive }, session })
  );
  await updatedReloadSystemModel();
};
