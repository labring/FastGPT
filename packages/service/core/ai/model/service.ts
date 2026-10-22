import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  CreateModelBody,
  CreateModelsFromTemplatesBody,
  UpdateModelBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import { getLogger, LogCategories } from '../../../common/logger';
import { invalidateTeamModelCatalog } from './catalog/cache';
import type { ModelCatalogScope } from './catalog/entity';
import { updatedReloadSystemModel } from './catalog/service';
import { runModelTransaction } from './catalog/transaction';
import {
  removeModelsFromChannels,
  syncModelNameInChannels,
  updateModelChannelBindings
} from './channel/binding';
import { deleteModelRecords } from './cleanup';
import { importSystemModels as importSystemModelRecords } from './import';
import { MongoAIModel } from './schema';
import { refreshModelTemplates } from './template';
import { getModelConfigUpdate, sanitizeTeamModelData } from './utils';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

/**
 * 写入归属，只来自鉴权身份。团队写入在类型上要求 teamId + tmbId；
 * 系统写入忽略身份字段（路由可直接透传 actor，不必按 channelType 置空）。
 */
type ModelMutationOwner =
  | { channelType?: 'system'; teamId?: string; tmbId?: string }
  | { channelType: 'team'; teamId: string; tmbId: string };

/**
 * 解析写入作用域：context 用于目录修订号，filter 同时作为所有读写查询条件。
 * 团队 filter 带上 tmbId，事务内的查询即可原子保证“只操作自己的模型”，避免鉴权与写入之间的竞态。
 */
const getMutationScope = (owner: ModelMutationOwner) => {
  if (owner.channelType !== 'team') {
    return {
      context: { scope: ModelScopeEnum.system } satisfies ModelCatalogScope,
      filter: { scope: ModelScopeEnum.system }
    };
  }
  const { teamId, tmbId } = owner;
  return {
    context: { scope: ModelScopeEnum.team, teamId } satisfies ModelCatalogScope,
    filter: { scope: ModelScopeEnum.team, teamId, tmbId }
  };
};

/** 渠道按 system / 成员分组路由；system 渠道不按成员分组，tmbId 不参与路由。 */
const getChannelScope = (owner: ModelMutationOwner) =>
  owner.channelType === 'team'
    ? { channelType: 'team' as const, tmbId: owner.tmbId }
    : { channelType: 'system' as const, tmbId: '' };

/** 提交后刷新本地目录；跨实例一致性由事务中的目录修订号负责，不再删除所有成员的权限缓存。 */
const refreshMutationCatalog = async (context: ModelCatalogScope) => {
  if (context.scope === ModelScopeEnum.team) invalidateTeamModelCatalog(context.teamId);
  else await updatedReloadSystemModel();
};

/** 原子校验归属、类型和重名并更新配置；提交后同步渠道名称，失败补偿本次数据库名称变更。 */
export const updateModel = async ({
  modelId,
  modelData,
  ...owner
}: Omit<UpdateModelBody, 'channelType'> & ModelMutationOwner) => {
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
  await synchronizeModelRenames({ changes: [change], owner });
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
  ...owner
}: { modelIds: string[]; isActive: boolean } & ModelMutationOwner) => {
  const { context, filter } = getMutationScope(owner);
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
  channelIds,
  ...owner
}: Pick<CreateModelBody, 'modelData' | 'channelIds'> & ModelMutationOwner) => {
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
  await bindCreatedModelsToChannels({ models: [modelData.model], channelIds, owner });
  return { modelId: String(model._id) };
};

/** 从最新模板创建缺失的停用实例；重复提交不会覆盖已安装模型或无意义地增加目录版本。 */
export const createModelsFromTemplates = async ({
  templates,
  channelIds,
  ...owner
}: Omit<CreateModelsFromTemplatesBody, 'channelType'> & ModelMutationOwner) => {
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
  const models =
    missing.length === 0
      ? []
      : await runModelTransaction(context, (session) =>
          MongoAIModel.insertMany(
            missing.map((template) => ({
              ...(context.scope === ModelScopeEnum.team
                ? sanitizeTeamModelData(template)
                : template),
              ...filter,
              isActive: false
            })),
            { session }
          )
        );
  if (models.length > 0) await refreshMutationCatalog(context);
  await bindCreatedModelsToChannels({
    models: templates.map(({ model }) => model),
    channelIds,
    owner
  });
  return {
    models: models.map((model) => ({
      modelId: String(model._id),
      type: model.type,
      model: model.model
    }))
  };
};

/** 同一事务删除实体、ACL 与探测记录；提交后清理渠道引用，渠道失败仅记录诊断。 */
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
  const names = models.map(({ model }) => model);
  await cleanDeletedModelChannels({ models: names, owner });
  return names;
};

/** 创建已提交后尽力关联渠道；逐模型保留失败诊断，某项失败不阻断后续关联。 */
const bindCreatedModelsToChannels = async ({
  models,
  channelIds,
  owner
}: {
  models: string[];
  channelIds?: number[];
  owner: ModelMutationOwner;
}) => {
  if (!channelIds?.length) return;
  const channelScope = getChannelScope(owner);
  for (const model of new Set(models)) {
    await updateModelChannelBindings({ model, addChannelIds: channelIds, ...channelScope }).catch(
      (error) => {
        logger.error('Append model to channels after creation failed', {
          channelIds,
          model,
          ...channelScope,
          error
        });
      }
    );
  }
};

/** 普通编辑和 JSON 导入共用改名副作用；渠道内部回滚后补偿 Mongo 名称，失败保留明确诊断。 */
const synchronizeModelRenames = async ({
  changes,
  owner
}: {
  changes: { modelId: string; oldModel: string; newModel: string }[];
  owner: ModelMutationOwner;
}) => {
  const failures: unknown[] = [];
  for (const change of changes) {
    if (change.oldModel === change.newModel) continue;
    try {
      await syncModelNameInChannels({ ...change, ...getChannelScope(owner) });
    } catch (error) {
      await restoreModelName({ ...change, ...owner }).catch((rollbackError) => {
        logger.error('Rollback model name after channel failure failed', {
          ...change,
          rollbackError
        });
      });
      failures.push(error);
    }
  }
  // 导入中的各个改名独立提交，某一项失败也要继续同步后续项，避免留下未处理的 Mongo 名称。
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'Multiple model channel renames failed');
};

/** 删除已经提交，渠道清理失败只记录诊断，不能将成功删除误报为数据库失败。 */
const cleanDeletedModelChannels = async ({
  models,
  owner
}: {
  models: string[];
  owner: ModelMutationOwner;
}) => {
  if (models.length === 0) return;
  const channelScope = getChannelScope(owner);
  await removeModelsFromChannels({ models, ...channelScope }).catch((error) => {
    logger.error('Clean up channel mappings after model deletion failed', {
      ...channelScope,
      models,
      error
    });
  });
};

/** JSON 替换与普通 CRUD 共用渠道改名和删除清理，避免导入后留下过期渠道引用。 */
export const importSystemModels = async (props: Parameters<typeof importSystemModelRecords>[0]) => {
  const changes = await importSystemModelRecords(props);
  try {
    await synchronizeModelRenames({
      changes: changes.renamedModels,
      owner: { channelType: 'system' }
    });
  } finally {
    await cleanDeletedModelChannels({
      models: changes.removedModels,
      owner: { channelType: 'system' }
    });
  }
};
