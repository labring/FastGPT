import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type { ClientSession } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoAIModel } from './schema';
import { updatedReloadSystemModel } from './utils';

type EditableSystemModelData = Omit<SystemModelDocumentDataType, 'model'>;

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
  await updateExistingSystemModels({ modelIds: [modelId], update: modelData });
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
  await mongoSessionRun((session) =>
    updateExistingSystemModels({ modelIds, update: { isActive }, session })
  );
  await updatedReloadSystemModel();
};
