import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { Types } from '../../../common/mongo';
import type { ModelCatalogScope } from './catalog/entity';
import { runModelTransaction } from './catalog/transaction';
import { deleteModelRecords } from './cleanup';
import { MongoAIModel } from './schema';
import { updatedReloadSystemModel } from './catalog/service';
import { invalidateTeamModelCatalog } from './teamModelCache';
import { refreshModelTemplates } from './template';
import type {
  CreateModelBody,
  CreateModelsFromTemplatesBody,
  UpdateModelBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import { getModelConfigUpdate, sanitizeTeamModelData } from './utils';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';

type ModelMutationOwner = { channelType?: ChannelType; tmbId?: string; teamId?: string };

/** 归属只来自鉴权身份；团队写入必须同时携带团队和成员，不能回退到系统版本或无归属查询。 */
const getMutationScope = ({ channelType = 'system', teamId, tmbId }: ModelMutationOwner) => {
  if (channelType === 'system') {
    return {
      context: { scope: ModelScopeEnum.system } satisfies ModelCatalogScope,
      filter: { scope: ModelScopeEnum.system }
    };
  }
  if (!teamId || !tmbId || !Types.ObjectId.isValid(teamId) || !Types.ObjectId.isValid(tmbId)) {
    throw new UserError(ModelErrEnum.unExist);
  }
  return {
    context: { scope: ModelScopeEnum.team, teamId } satisfies ModelCatalogScope,
    filter: { scope: ModelScopeEnum.team, teamId, tmbId }
  };
};

/** 提交后刷新本地目录；跨实例一致性由事务中的目录修订号负责，不再删除所有成员的权限缓存。 */
const refreshMutationCatalog = async (context: ModelCatalogScope) => {
  if (context.scope === ModelScopeEnum.team) invalidateTeamModelCatalog(context.teamId);
  else await updatedReloadSystemModel();
};

/** 原子校验归属、类型和重名并更新配置；返回名称变更，渠道副作用由生命周期层协调。 */
export const updateModel = async ({
  modelId,
  modelData,
  ...owner
}: UpdateModelBody & ModelMutationOwner) => {
  const { context, filter } = getMutationScope(owner);
  const change = await runModelTransaction(context, async (session) => {
    const existing = await MongoAIModel.findOne({ _id: modelId, ...filter })
      .session(session)
      .lean();
    if (!existing) throw new UserError(ModelErrEnum.unExist);
    if (existing.type !== modelData.type) throw new UserError('Model type cannot be changed');
    const newModel = modelData.model?.trim() ?? existing.model;
    if (
      newModel !== existing.model &&
      (await MongoAIModel.exists({
        ...filter,
        model: newModel,
        _id: { $ne: modelId }
      }).session(session))
    )
      throw new UserError(ModelErrEnum.alreadyExists);
    await MongoAIModel.updateOne(
      { _id: modelId, ...filter },
      getModelConfigUpdate(
        context.scope === ModelScopeEnum.team ? sanitizeTeamModelData(modelData) : modelData
      ),
      { session }
    );
    return { modelId, oldModel: existing.model, newModel };
  });
  await refreshMutationCatalog(context);
  return change;
};

/** 渠道改名失败时只补偿该次名称变化；条件更新避免覆盖之后已经成功提交的另一轮改名。 */
export const restoreModelName = async ({
  modelId,
  oldModel,
  newModel,
  ...owner
}: { modelId: string; oldModel: string; newModel: string } & ModelMutationOwner) => {
  const { context, filter } = getMutationScope(owner);
  await runModelTransaction(context, (session) =>
    MongoAIModel.updateOne(
      { _id: modelId, model: newModel, ...filter },
      { $set: { model: oldModel } },
      { session }
    )
  );
  await refreshMutationCatalog(context);
};

/** 批量启停必须完整命中所属桶，否则整个事务回滚，不产生部分生效或错误修订号。 */
export const updateModelStatus = async ({
  modelIds,
  isActive,
  scope = ModelScopeEnum.system,
  ...owner
}: {
  modelIds: string[];
  isActive: boolean;
  scope?: ModelScopeEnum;
  teamId?: string;
  tmbId?: string;
}) => {
  const { context, filter } = getMutationScope({
    ...owner,
    channelType: scope === ModelScopeEnum.team ? 'team' : 'system'
  });
  await runModelTransaction(context, async (session) => {
    const result = await MongoAIModel.updateMany(
      { _id: { $in: modelIds }, ...filter },
      { $set: { isActive } },
      { session }
    );
    if (result.matchedCount !== new Set(modelIds).size) throw new UserError(ModelErrEnum.unExist);
  });
  await refreshMutationCatalog(context);
};

/** 创建时覆盖请求中的归属字段；团队模型去除系统专用的直连配置，唯一索引负责并发重名兜底。 */
export const createModel = async ({
  modelData,
  ...owner
}: Pick<CreateModelBody, 'modelData' | 'channelType'> & ModelMutationOwner) => {
  const { context, filter } = getMutationScope(owner);
  const { tmbId: _tmbId, teamId: _teamId, scope: _scope, ...data } = modelData;
  const [model] = await runModelTransaction(context, async (session) => {
    if (await MongoAIModel.exists({ ...filter, model: data.model }).session(session)) {
      throw new UserError(ModelErrEnum.alreadyExists);
    }
    return MongoAIModel.create(
      [
        {
          ...(context.scope === ModelScopeEnum.team ? sanitizeTeamModelData(data) : data),
          ...filter,
          isActive: data.isActive ?? false
        }
      ],
      { session }
    );
  });
  await refreshMutationCatalog(context);
  return { modelId: String(model._id) };
};

/** 从最新模板创建缺失的停用实例；重复提交不会覆盖已安装模型或无意义地增加目录版本。 */
export const createModelsFromTemplates = async ({
  templates,
  ...owner
}: CreateModelsFromTemplatesBody & ModelMutationOwner) => {
  const { context, filter } = getMutationScope(owner);
  const latestTemplates = await refreshModelTemplates();
  const templateMap = new Map(
    latestTemplates.map((template) => [`${template.type}:${template.model}`, template])
  );
  const selected = Array.from(
    new Map(
      templates.map((reference) => {
        const key = `${reference.type}:${reference.model}`;
        const template = templateMap.get(key);
        if (!template) throw new UserError(`Model template no longer exists: ${key}`);
        return [template.model, template] as const;
      })
    ).values()
  );
  const existing = await MongoAIModel.find({
    ...filter,
    model: { $in: selected.map(({ model }) => model) }
  })
    .select({ model: 1 })
    .lean();
  const names = new Set(existing.map(({ model }) => model));
  const missing = selected.filter(({ model }) => !names.has(model));
  if (missing.length === 0) return { models: [] };
  const models = await runModelTransaction(context, (session) =>
    MongoAIModel.insertMany(
      missing.map((template) => ({
        ...(context.scope === ModelScopeEnum.team ? sanitizeTeamModelData(template) : template),
        ...filter,
        isActive: false
      })),
      { session }
    )
  );
  await refreshMutationCatalog(context);
  return {
    models: models.map((model) => ({
      modelId: String(model._id),
      type: model.type,
      model: model.model
    }))
  };
};

/** 同一事务删除实体、ACL 与探测记录；返回名称供生命周期层清理渠道引用。 */
export const deleteModels = async ({
  modelIds,
  ...owner
}: { modelIds: string[] } & ModelMutationOwner): Promise<string[]> => {
  const { context, filter } = getMutationScope(owner);
  const models = await runModelTransaction(context, async (session) => {
    const records = await MongoAIModel.find({ _id: { $in: modelIds }, ...filter })
      .session(session)
      .lean();
    if (records.length !== new Set(modelIds).size) throw new UserError(ModelErrEnum.unExist);
    await deleteModelRecords(modelIds, session);
    return records;
  });
  await refreshMutationCatalog(context);
  return models.map(({ model }) => model);
};
