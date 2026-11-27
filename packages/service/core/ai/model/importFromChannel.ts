import { LeaseCache } from '@fastgpt/dal/redis/caches/lease';
import { channelTypeToScope } from '@fastgpt/global/core/ai/model/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import type {
  ImportFromChannelBody,
  ImportFromChannelResponse,
  PreviewImportFromChannelQuery,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { isAxiosError, type AxiosError } from 'axios';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import { isAiproxyNotImplementedError } from '../../../thirdProvider/aiproxy/error';
import { getSystemModelHandle, getTeamModelHandle } from './catalog/service';
import { getCachedTypeMetas } from './channel/cache';
import { getAiproxyClientByScope } from './channel/client';
import { resolveChannelForOperation } from './channel/resolve';
import { getModelProviders } from './provider/controller';
import { createModel } from './service';
import { refreshModelTemplates } from './template';
import { classifyChannelModels, inferFastGPTProvider } from './importFromChannelUtils';

type ChannelImportScope = PreviewImportFromChannelQuery & {
  teamId: string;
  tmbId: string;
};

const channelImportLease = new LeaseCache();

/** 读取所选渠道的完整上游目录，筛除当前作用域已有模型后生成导入预览。 */
export const previewImportFromChannel = async ({
  channelId,
  channelType,
  teamId,
  tmbId
}: ChannelImportScope): Promise<PreviewImportFromChannelResponse> => {
  // 1. 先校验所选渠道并读取其类型，后续映射 provider 必须基于同一渠道。
  const scope = { channelType, tmbId };
  const channel = await resolveChannelForOperation({ id: channelId, ...scope });
  const { channels } = getAiproxyClientByScope(scope);
  // 2. 并行读取预览所需目录与 type-meta，减少多段网络/存储等待。
  const [channelModels, installedModels, templates, typeMetas] = await Promise.all([
    channels.getModelCatalog(channelId).catch((error) => {
      if (isAiproxyNotImplementedError(error)) {
        throw new UserError(ModelErrEnum.channelCatalogUnsupported);
      }
      throw error;
    }),
    channelType === 'team'
      ? getTeamModelHandle({ teamId }).then((handle) => handle.getTeamModels(tmbId))
      : getSystemModelHandle().then((handle) => handle.getSystemModels()),
    refreshModelTemplates(),
    // type-meta 只用于 provider 推断；读取失败时由空白草稿使用默认 provider。
    getCachedTypeMetas(() => aiProxyClient.getTypeMetas()).catch(() => undefined)
  ]);

  // 3. 只在协议名与 FastGPT provider 名唯一相同时填 provider。
  const provider = inferFastGPTProvider({
    channelTypeName: typeMetas?.[channel.type]?.name,
    providers: getModelProviders('en')
  });

  // 4. 使用已安装模型名和目标渠道映射精确筛除，将唯一 provider 传给空白草稿。
  return {
    items: classifyChannelModels({
      channelModels,
      installedModelNames: installedModels.map(({ model }) => model),
      targetChannelModels: channel.models ?? [],
      targetModelMappings: channel.model_mapping ?? {},
      templates,
      provider
    })
  };
};

/** 逐条创建模型并一次绑定到目标渠道，按请求顺序保留创建和绑定的结果。 */
export const importFromChannel = async ({
  channelId,
  channelType,
  models,
  tmbId,
  teamId
}: ChannelImportScope &
  Pick<ImportFromChannelBody, 'models'>): Promise<ImportFromChannelResponse> => {
  const scope = { channelType, tmbId };
  const channelScope = { id: channelId, ...scope };
  const channel = await resolveChannelForOperation(channelScope);
  const results: ImportFromChannelResponse['results'] = [];
  const created: { index: number; model: string; modelId: string }[] = [];
  // 导入直接使用上游 ID，同名别名只能指向该 ID。
  const hasMappingConflict = (mapping: typeof channel.model_mapping, model: string) =>
    !!mapping && Object.hasOwn(mapping, model) && mapping[model] !== model;

  // 建模和目录刷新在锁外执行，租约只保护导入的渠道读写。
  for (const [index, modelData] of models.entries()) {
    const { model } = modelData;
    if (hasMappingConflict(channel.model_mapping, model)) {
      results[index] = { status: 'failed', model, error: ModelErrEnum.channelModelMappingConflict };
      continue;
    }
    try {
      const { modelId } = await createModel({
        modelData: {
          ...modelData,
          scope: channelTypeToScope(channelType),
          isActive: modelData.isActive ?? true
        },
        ...scope,
        teamId
      });
      created.push({ index, model, modelId });
    } catch (error) {
      results[index] = {
        status: 'failed',
        model,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  if (created.length === 0) return { results };

  // 在锁内基于最新渠道复核映射并合并绑定，只写一次完整模型列表。
  const { channels } = getAiproxyClientByScope(scope);
  const channelOwner = channelType === 'team' ? `team:${tmbId}` : 'system';
  let ambiguousWrite: AxiosError | undefined;
  try {
    await channelImportLease.withLease({
      key: `model-channel-import:${channelOwner}:${channelId}`,
      label: 'model-channel-import',
      ttlMs: 60_000,
      fn: async ({ assertValid }) => {
        const currentChannel = await resolveChannelForOperation(channelScope);
        const currentModels = new Set(currentChannel.models);
        for (const { index, model, modelId } of created) {
          if (hasMappingConflict(currentChannel.model_mapping, model)) {
            results[index] = {
              status: 'failed',
              model,
              modelId,
              error: ModelErrEnum.channelModelMappingConflict
            };
          } else if (currentModels.has(model)) {
            results[index] = { status: 'success', model, modelId };
          }
        }

        const toBind = created.filter(({ index }) => !results[index]);
        if (toBind.length === 0) return;
        const patch = {
          models: [...(currentChannel.models ?? []), ...new Set(toBind.map(({ model }) => model))],
          ...(currentChannel.model_mapping !== undefined && {
            model_mapping: currentChannel.model_mapping
          })
        };
        assertValid();
        await channels.update(channelId, patch).catch((error) => {
          if (isAxiosError(error)) {
            const status = error.response?.status;
            if (status === undefined || [500, 502, 503, 504].includes(status))
              ambiguousWrite = error;
          }
          throw error;
        });
        for (const { index, model, modelId } of toBind) {
          results[index] = { status: 'success', model, modelId };
        }
      }
    });
  } catch (error) {
    // 即使回调结束时失租，已确认的回执也有效。只对未确认的写入读回一次，避免重复提交。
    const observed = ambiguousWrite
      ? await resolveChannelForOperation(channelScope).catch(() => undefined)
      : undefined;
    const observedModels = new Set(observed?.models);
    const message =
      ambiguousWrite?.message ?? (error instanceof Error ? error.message : String(error));
    for (const { index, model, modelId } of created) {
      if (results[index]) continue;
      results[index] =
        observedModels.has(model) && !hasMappingConflict(observed?.model_mapping, model)
          ? { status: 'success', model, modelId }
          : { status: ambiguousWrite ? 'unknown' : 'failed', model, modelId, error: message };
    }
  }

  return { results };
};
