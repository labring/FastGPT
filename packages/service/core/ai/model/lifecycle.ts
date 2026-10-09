import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import type {
  CreateModelResponse,
  UpdateModelBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { getLogger, LogCategories } from '../../../common/logger';
import {
  updateModelChannelBindings,
  removeModelsFromChannels,
  syncModelNameInChannels
} from './channel/binding';
import { importSystemModels } from './import';
import {
  createModel,
  createModelsFromTemplates,
  deleteModels,
  updateModel,
  restoreModelName
} from './mutation';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

/**
 * 聚合创建模型与其渠道快捷绑定的通用生命周期服务。
 * 1. 调用 createModel 在 Mongo 中完成唯一性校验与事务落库；
 * 2. 若传入 channelIds，在所属桶内追加渠道关联；
 * 3. 生命周期层决定绑定失败仅记录诊断，底层渠道操作仍保留真实错误。
 */
export const createModelWithLifecycle = async ({
  modelData,
  channelType,
  channelIds,
  tmbId,
  teamId
}: {
  modelData: AIModelDocumentDataType;
  channelType: ChannelType;
  channelIds?: number[];
  tmbId?: string;
  teamId?: string;
}): Promise<CreateModelResponse> => {
  const createResult = await createModel({
    modelData,
    channelType,
    tmbId,
    teamId
  });

  await bindCreatedModelsToChannels({ models: [modelData.model], channelIds, channelType, tmbId });

  return createResult;
};

/**
 * 模板创建与普通创建共用提交后绑定策略。已安装模板也应绑定用户本次选择的渠道，
 * 因而以请求模板集合为准，不能只使用 mutation 返回的新增模型列表。
 */
export const createModelsFromTemplatesWithLifecycle = async (
  props: Parameters<typeof createModelsFromTemplates>[0]
) => {
  const result = await createModelsFromTemplates(props);
  await bindCreatedModelsToChannels({
    models: props.templates.map(({ model }) => model),
    channelIds: props.channelIds,
    channelType: props.channelType,
    tmbId: props.tmbId
  });
  return result;
};

/** 创建已提交后尽力关联渠道；逐模型保留失败诊断，某项失败不阻断后续关联。 */
const bindCreatedModelsToChannels = async ({
  models,
  channelIds,
  channelType,
  tmbId
}: {
  models: string[];
  channelIds?: number[];
  channelType: ChannelType;
  tmbId?: string;
}) => {
  if (!channelIds?.length) return;
  for (const model of new Set(models)) {
    await updateModelChannelBindings({
      model,
      addChannelIds: channelIds,
      channelType,
      tmbId: tmbId ?? ''
    }).catch((error) => {
      logger.error('Append model to channels after creation failed', {
        channelIds,
        model,
        channelType,
        tmbId,
        error
      });
    });
  }
};

/**
 * 聚合更新模型配置并自动同步渠道上游映射的通用生命周期服务。
 * 1. 自动注入 syncModelNameInChannels；
 * 2. 当模型标识发生变更时，协调更新 Mongo 并在模型所属的作用域桶内同步全部渠道的 models 与 model_mapping；
 * 3. 若渠道同步失败，由底层触发补偿回滚保持两端一致。
 */
export const updateModelWithLifecycle = async (
  props: UpdateModelBody & { tmbId?: string; teamId?: string }
): Promise<void> => {
  const change = await updateModel(props);
  await synchronizeModelRenames({
    changes: [change],
    channelType: props.channelType,
    tmbId: props.tmbId,
    teamId: props.teamId
  });
};

/** 普通编辑和 JSON 导入共用改名副作用；渠道内部回滚后补偿 Mongo 名称，失败保留明确诊断。 */
const synchronizeModelRenames = async ({
  changes,
  channelType,
  tmbId,
  teamId
}: {
  changes: { modelId: string; oldModel: string; newModel: string }[];
  channelType: ChannelType;
  tmbId?: string;
  teamId?: string;
}) => {
  const failures: unknown[] = [];
  for (const change of changes) {
    if (change.oldModel === change.newModel) continue;
    try {
      await syncModelNameInChannels({ ...change, channelType, tmbId: tmbId ?? '' });
    } catch (error) {
      await restoreModelName({ ...change, channelType, tmbId, teamId }).catch((rollbackError) => {
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

/** JSON 替换与普通 CRUD 共用渠道改名和删除清理，避免导入后留下过期渠道引用。 */
export const importSystemModelsWithLifecycle = async (
  props: Parameters<typeof importSystemModels>[0]
) => {
  const changes = await importSystemModels(props);
  try {
    await synchronizeModelRenames({ changes: changes.renamedModels, channelType: 'system' });
  } finally {
    await cleanDeletedModelChannels({ models: changes.removedModels, channelType: 'system' });
  }
};

/** 删除已经提交，渠道清理失败只记录诊断，不能将成功删除误报为数据库失败。 */
const cleanDeletedModelChannels = async ({
  models,
  channelType,
  tmbId
}: {
  models: string[];
  channelType: ChannelType;
  tmbId?: string;
}) => {
  if (models.length === 0) return;
  await removeModelsFromChannels({ models, channelType, tmbId: tmbId ?? '' }).catch((error) => {
    logger.error('Clean up channel mappings after model deletion failed', {
      channelType,
      models,
      error
    });
  });
};

/**
 * 聚合删除模型及其渠道映射清理的通用生命周期服务。
 * 1. 调用 deleteModels 在 Mongo 事务中删除模型实体、关联探测历史与权限记录，并返回已删除模型的 model 标识列表；
 * 2. 自动调用 removeModelsFromChannels 清理 AIProxy 渠道中对这些已删除模型引用的 models 与 model_mapping 映射；
 * 3. 渠道映射清理属于 AIProxy 侧副作用，若失败仅记录错误日志，不回滚已成功删除的 Mongo 实体。
 */
export const deleteModelsWithLifecycle = async (props: {
  modelIds: string[];
  channelType: ChannelType;
  tmbId?: string;
  teamId?: string;
}): Promise<string[]> => {
  const deletedModels = await deleteModels(props);
  await cleanDeletedModelChannels({
    models: deletedModels,
    channelType: props.channelType,
    tmbId: props.tmbId
  });
  return deletedModels;
};
