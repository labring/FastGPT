import type {
  AddChannelData,
  AiproxyChannel,
  AiproxyGroupChannel,
  UpdateChannelData
} from '../../../../thirdProvider/aiproxy/type';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { getErrorMessage } from '@fastgpt/global/common/error/utils';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import {
  isAiproxyAmbiguousWriteError,
  tolerateNotFound
} from '../../../../thirdProvider/aiproxy/error';
import { resolveChannelForOperation, resolveChannelsForOperation } from './resolve';
import { getAiproxyClientByScope } from './client';
import { withChannelWriteLock } from './lock';
import { getLogger, LogCategories } from '../../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

type ChannelRenameRecord = {
  channelId: number;
  renamedInModels: boolean;
  hadNewModelInModels: boolean;
  mappingChanged: boolean;
  previousMappingValue?: string;
  hadNewModelInMapping: boolean;
};

/** 从渠道配置中剔除指定模型名及其 model_mapping 条目；没有任何变化时返回 undefined。 */
const stripModelsFromChannel = (
  channel: AiproxyChannel | AiproxyGroupChannel,
  modelNames: Set<string>
): Pick<AddChannelData, 'models' | 'model_mapping'> | undefined => {
  const currentModels = channel.models ?? [];
  const models = currentModels.filter((name) => !modelNames.has(name));
  const mappingEntries = Object.entries(channel.model_mapping ?? {});
  const model_mapping = Object.fromEntries(
    mappingEntries.filter(([name]) => !modelNames.has(name))
  );
  const mappingChanged = mappingEntries.length !== Object.keys(model_mapping).length;
  if (models.length === currentModels.length && !mappingChanged) return undefined;
  // 映射被删光时不再下发空对象，避免 AI Proxy 把空 map 当作有效配置
  return {
    models,
    model_mapping: Object.keys(model_mapping).length > 0 ? model_mapping : undefined
  };
};

/** 导入直接使用上游 ID，渠道若把同名别名映射到其他上游模型则视为冲突。 */
export const hasChannelModelMappingConflict = (
  mapping: AiproxyChannel['model_mapping'],
  model: string
): boolean => Boolean(mapping && Object.hasOwn(mapping, model) && mapping[model] !== model);

/** 按渠道快照批量追加缺失模型，透传已有别名配置；全部已关联时不写入。 */
const getChannelModelsBindingPatch = ({
  channel,
  models
}: {
  channel: Pick<AiproxyChannel, 'models' | 'model_mapping'>;
  models: readonly string[];
}): Pick<UpdateChannelData, 'models' | 'model_mapping'> | undefined => {
  const currentModels = channel.models ?? [];
  const existingModels = new Set(currentModels);
  const missingModels = Array.from(new Set(models)).filter((model) => !existingModels.has(model));
  if (missingModels.length === 0) return;

  return {
    models: [...currentModels, ...missingModels],
    ...(channel.model_mapping !== undefined && { model_mapping: channel.model_mapping })
  };
};

/** 按渠道快照追加单个模型，透传已有别名配置；已关联时不写入。 */
const getChannelModelBindingPatch = ({
  channel,
  model
}: {
  channel: Pick<AiproxyChannel, 'models' | 'model_mapping'>;
  model: string;
}): Pick<UpdateChannelData, 'models' | 'model_mapping'> | undefined =>
  getChannelModelsBindingPatch({ channel, models: [model] });

/** 计算单个渠道的模型改名 patch 与回滚记录；未命中模型名和映射时返回 undefined。 */
const buildChannelModelRenamePlan = ({
  channel,
  oldModel,
  newModel
}: {
  channel: AiproxyChannel | AiproxyGroupChannel;
  oldModel: string;
  newModel: string;
}): { patch: UpdateChannelData; record: ChannelRenameRecord } | undefined => {
  const currentModels = channel.models ?? [];
  const hadNewModelInModels = currentModels.includes(newModel);
  const nextModels = Array.from(
    new Set(currentModels.map((modelName) => (modelName === oldModel ? newModel : modelName)))
  );
  const modelsChanged =
    nextModels.length !== currentModels.length ||
    nextModels.some((modelName, index) => modelName !== currentModels[index]);

  const currentMapping = channel.model_mapping;
  const mappingHasOldModel = currentMapping ? Object.hasOwn(currentMapping, oldModel) : false;
  const hadNewModelInMapping = currentMapping ? Object.hasOwn(currentMapping, newModel) : false;
  const nextMapping = (() => {
    if (!currentMapping || !mappingHasOldModel) return currentMapping;
    const oldMappingValue = currentMapping[oldModel];
    return Object.fromEntries([
      ...Object.entries(currentMapping).filter(([modelName]) => modelName !== oldModel),
      ...(!hadNewModelInMapping ? [[newModel, oldMappingValue] as const] : [])
    ]);
  })();

  if (!modelsChanged && !mappingHasOldModel) return undefined;
  return {
    patch: {
      ...(modelsChanged && { models: nextModels }),
      ...(mappingHasOldModel && { model_mapping: nextMapping })
    } satisfies UpdateChannelData,
    record: {
      channelId: channel.id,
      renamedInModels: modelsChanged,
      hadNewModelInModels,
      mappingChanged: mappingHasOldModel,
      previousMappingValue: mappingHasOldModel ? currentMapping?.[oldModel] : undefined,
      hadNewModelInMapping
    }
  };
};

/** 基于最新渠道快照构造精准回滚 patch，避免回滚覆盖期间其他并发写入新增的模型。 */
const buildChannelModelRenameRollbackPatch = ({
  channel,
  record,
  oldModel,
  newModel
}: {
  channel: AiproxyChannel | AiproxyGroupChannel;
  record: ChannelRenameRecord;
  oldModel: string;
  newModel: string;
}): UpdateChannelData | undefined => {
  const patch: UpdateChannelData = {};

  if (record.renamedInModels) {
    const currentModels = channel.models ?? [];
    patch.models = record.hadNewModelInModels
      ? currentModels.includes(oldModel)
        ? currentModels
        : [...currentModels, oldModel]
      : Array.from(
          new Set(currentModels.map((modelName) => (modelName === newModel ? oldModel : modelName)))
        );
  }

  if (record.mappingChanged && record.previousMappingValue !== undefined) {
    const currentMapping = channel.model_mapping ?? {};
    const entries = Object.entries(currentMapping).filter(([modelName, target]) => {
      if (modelName === oldModel) return false;
      if (
        !record.hadNewModelInMapping &&
        modelName === newModel &&
        target === record.previousMappingValue
      ) {
        return false;
      }
      return true;
    });
    patch.model_mapping = Object.fromEntries([...entries, [oldModel, record.previousMappingValue]]);
  }

  if (patch.models === undefined && patch.model_mapping === undefined) return undefined;
  return patch;
};

/**
 * 调整一个模型与若干渠道的关联：addChannelIds 追加模型名，removeChannelIds 剔除模型名及映射。
 * 渠道只在当前操作者的 system/成员桶内解析，其他成员的渠道一律按不存在处理；操作幂等。
 * 与创建时的快捷关联不同，这里是用户显式操作，失败必须抛出让前端提示。
 * 每个渠道的读改写都在统一渠道写锁内执行，避免与批量导入或其他写入互相覆盖。
 */
export const updateModelChannelBindings = async ({
  model,
  addChannelIds = [],
  removeChannelIds = [],
  channelType,
  tmbId
}: {
  model: string;
  addChannelIds?: number[];
  removeChannelIds?: number[];
  channelType: ChannelType;
  tmbId: string;
}): Promise<void> => {
  const trimmedModel = model.trim();
  if (!trimmedModel) return Promise.reject(ModelErrEnum.invalidModelConfig);

  const uniqueAddIds = Array.from(new Set(addChannelIds));
  const addIdSet = new Set(uniqueAddIds);
  const uniqueRemoveIds = Array.from(new Set(removeChannelIds)).filter((id) => !addIdSet.has(id));
  const targetChannelIds = [...uniqueAddIds, ...uniqueRemoveIds];
  if (targetChannelIds.length === 0) return;

  // 1. 先校验全部目标渠道在当前作用域存在，避免部分写入后才因无效 ID 失败。
  await resolveChannelsForOperation({ ids: targetChannelIds, channelType, tmbId });
  const client = getAiproxyClientByScope({ channelType, tmbId }).channels;

  // 2. 在单渠道写锁内读取最新快照并计算增量，避免覆盖并发导入或手动修改。
  const runBindingWrite = (channelId: number, action: 'add' | 'remove') =>
    withChannelWriteLock({
      channelId,
      channelType,
      tmbId,
      fn: async ({ assertValid }) => {
        const latestChannel = await resolveChannelForOperation({
          id: channelId,
          channelType,
          tmbId
        });
        const patch =
          action === 'add'
            ? getChannelModelBindingPatch({ channel: latestChannel, model: trimmedModel })
            : stripModelsFromChannel(latestChannel, new Set([trimmedModel]));
        if (!patch) return;
        assertValid();
        await client.update(channelId, patch);
      }
    });

  await Promise.all([
    ...uniqueAddIds.map((channelId) => runBindingWrite(channelId, 'add')),
    ...uniqueRemoveIds.map((channelId) => runBindingWrite(channelId, 'remove'))
  ]);
};

/**
 * 在模型所属的 system/成员 bucket 内同步上游模型标识。
 * 同时更新 channels.models 和 model_mapping 的公开名 key；中途失败时在锁内基于最新快照尽力回滚。
 */
export const syncModelNameInChannels = async ({
  oldModel,
  newModel,
  channelType,
  tmbId
}: {
  oldModel: string;
  newModel: string;
  channelType: ChannelType;
  tmbId: string;
}): Promise<void> => {
  const normalizedOldModel = oldModel.trim();
  const normalizedNewModel = newModel.trim();
  if (!normalizedOldModel || !normalizedNewModel) {
    return Promise.reject(ModelErrEnum.invalidModelConfig);
  }
  if (normalizedOldModel === normalizedNewModel) return;

  const client = getAiproxyClientByScope({ channelType, tmbId }).channels;
  const channels = (await tolerateNotFound(() => client.listAll(), [])) ?? [];
  const candidateChannelIds = channels
    .filter(
      (channel) =>
        buildChannelModelRenamePlan({
          channel,
          oldModel: normalizedOldModel,
          newModel: normalizedNewModel
        }) !== undefined
    )
    .map((channel) => channel.id);

  const completedUpdates: ChannelRenameRecord[] = [];
  try {
    for (const channelId of candidateChannelIds) {
      await withChannelWriteLock({
        channelId,
        channelType,
        tmbId,
        fn: async ({ assertValid }) => {
          const latestChannel = await tolerateNotFound(() => client.get(channelId));
          if (!latestChannel) return;
          const plan = buildChannelModelRenamePlan({
            channel: latestChannel,
            oldModel: normalizedOldModel,
            newModel: normalizedNewModel
          });
          if (!plan) return;
          assertValid();
          await client.update(channelId, plan.patch);
          completedUpdates.push(plan.record);
        }
      });
    }
  } catch (error) {
    const rollbacks = await Promise.allSettled(
      completedUpdates.map((record) =>
        withChannelWriteLock({
          channelId: record.channelId,
          channelType,
          tmbId,
          fn: async ({ assertValid }) => {
            const latestChannel = await tolerateNotFound(() => client.get(record.channelId));
            if (!latestChannel) return;
            const rollbackPatch = buildChannelModelRenameRollbackPatch({
              channel: latestChannel,
              record,
              oldModel: normalizedOldModel,
              newModel: normalizedNewModel
            });
            if (!rollbackPatch) return;
            assertValid();
            await client.update(record.channelId, rollbackPatch);
          }
        })
      )
    );
    rollbacks.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error('Rollback channel model rename failed', {
          channelId: completedUpdates[index].channelId,
          channelType,
          tmbId,
          oldModel,
          newModel,
          error: result.reason
        });
      }
    });
    throw error;
  }
};

/**
 * 模型删除后清理所在桶（system 或成员分组）内全部渠道对这些模型名的引用，包括 models 与 model_mapping。
 * 渠道本身以及其他模型的映射保持不变；桶尚未创建（AI Proxy 404）视为无需清理。
 */
export const removeModelsFromChannels = async ({
  models,
  channelType,
  tmbId
}: {
  models: string[];
  channelType: ChannelType;
  tmbId: string;
}): Promise<void> => {
  const modelNames = new Set(models.map((name) => name.trim()).filter(Boolean));
  if (modelNames.size === 0) return;

  const client = getAiproxyClientByScope({ channelType, tmbId }).channels;
  const channels = (await tolerateNotFound(() => client.listAll(), [])) ?? [];
  const candidateChannelIds = channels
    .filter((channel) => stripModelsFromChannel(channel, modelNames) !== undefined)
    .map((channel) => channel.id);

  await Promise.all(
    candidateChannelIds.map((channelId) =>
      withChannelWriteLock({
        channelId,
        channelType,
        tmbId,
        fn: async ({ assertValid }) => {
          const latestChannel = await tolerateNotFound(() => client.get(channelId));
          if (!latestChannel) return;
          const patch = stripModelsFromChannel(latestChannel, modelNames);
          if (!patch) return;
          assertValid();
          await client.update(channelId, patch);
        }
      })
    )
  );
};

export type ChannelBatchBindItemResult =
  | { status: 'success' }
  | { status: 'failed'; error: string }
  | { status: 'unknown'; error: string };

/**
 * 在单渠道排队写锁内批量绑定新导入的模型，并对未确认的传输/5xx 写入做一次权威读回对账。
 * 与手动绑定、改名同步、删模型清理和渠道编辑共用同一写锁，防止并发覆盖。
 */
export const bindImportedModelsToChannel = async ({
  channelId,
  channelType,
  tmbId,
  models
}: {
  channelId: number;
  channelType: ChannelType;
  tmbId: string;
  models: readonly string[];
}): Promise<Map<string, ChannelBatchBindItemResult>> => {
  const uniqueModels = Array.from(new Set(models));
  const outcome = new Map<string, ChannelBatchBindItemResult>();
  if (uniqueModels.length === 0) return outcome;

  const scope = { channelType, tmbId };
  const channelScope = { id: channelId, ...scope };
  const { channels } = getAiproxyClientByScope(scope);
  let ambiguousWrite: unknown;

  try {
    await withChannelWriteLock({
      channelId,
      ...scope,
      fn: async ({ assertValid }) => {
        const currentChannel = await resolveChannelForOperation(channelScope);
        const currentModels = new Set(currentChannel.models);
        for (const model of uniqueModels) {
          if (hasChannelModelMappingConflict(currentChannel.model_mapping, model)) {
            outcome.set(model, {
              status: 'failed',
              error: ModelErrEnum.channelModelMappingConflict
            });
          } else if (currentModels.has(model)) {
            outcome.set(model, { status: 'success' });
          }
        }

        const toBind = uniqueModels.filter((model) => !outcome.has(model));
        if (toBind.length === 0) return;

        const patch = getChannelModelsBindingPatch({
          channel: currentChannel,
          models: toBind
        });
        if (!patch) {
          for (const model of toBind) outcome.set(model, { status: 'success' });
          return;
        }

        assertValid();
        await channels.update(channelId, patch).catch((error) => {
          if (isAiproxyAmbiguousWriteError(error)) ambiguousWrite = error;
          throw error;
        });
        for (const model of toBind) outcome.set(model, { status: 'success' });
      }
    });
  } catch (error) {
    // 即使回调结束时失租，已确认的回执也有效；只对未确认的写入读回一次，避免重复提交。
    const observed =
      ambiguousWrite !== undefined
        ? await resolveChannelForOperation(channelScope).catch(() => undefined)
        : undefined;
    const observedModels = new Set(observed?.models);
    const message =
      ambiguousWrite !== undefined
        ? getErrorMessage(
            ambiguousWrite,
            ambiguousWrite instanceof Error ? ambiguousWrite.message : String(ambiguousWrite)
          )
        : error instanceof Error
          ? error.message
          : String(error);

    for (const model of uniqueModels) {
      if (outcome.has(model)) continue;
      outcome.set(
        model,
        observedModels.has(model) && !hasChannelModelMappingConflict(observed?.model_mapping, model)
          ? { status: 'success' }
          : { status: ambiguousWrite !== undefined ? 'unknown' : 'failed', error: message }
      );
    }
  }

  return outcome;
};
