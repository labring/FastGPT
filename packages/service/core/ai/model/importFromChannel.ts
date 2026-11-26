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
import { isAxiosError } from 'axios';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import { isAiproxyNotImplementedError } from '../../../thirdProvider/aiproxy/error';
import { getSystemModelHandle, getTeamModelHandle } from './catalog/service';
import { getCachedTypeMetas } from './channel/cache';
import { getChannelModelBindingPatch } from './channel/binding';
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

/** 逐条创建模型并绑定到同一作用域的渠道。关联失败时保留已创建的模型 ID。 */
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
  await resolveChannelForOperation(channelScope);
  if (models.length === 0) return { results: [] };
  const { channels } = getAiproxyClientByScope(scope);

  const readChannelForModel = async (model: string) => {
    const channel = await resolveChannelForOperation(channelScope);
    const mapping = channel.model_mapping;
    // 导入直接使用上游 ID，同名别名只能指向该 ID。
    if (mapping && Object.hasOwn(mapping, model) && mapping[model] !== model) {
      throw new UserError(ModelErrEnum.channelModelMappingConflict);
    }
    return channel;
  };

  const channelOwner = channelType === 'team' ? `team:${tmbId}` : 'system';
  // 更新接口接收完整模型列表，同一渠道的导入需要独占读写，避免覆盖其他批次的绑定。
  return channelImportLease.withLease({
    key: `model-channel-import:${channelOwner}:${channelId}`,
    label: 'model-channel-import',
    ttlMs: 60_000,
    fn: async ({ assertValid }) => {
      const results: ImportFromChannelResponse['results'] = [];
      for (const modelData of models) {
        assertValid();
        const { model } = modelData;
        let modelId: string | undefined;
        try {
          await readChannelForModel(model);
          assertValid();
          const createdModel = await createModel({
            modelData: {
              ...modelData,
              scope: channelTypeToScope(channelType),
              isActive: modelData.isActive ?? true
            },
            ...scope,
            teamId
          });
          modelId = createdModel.modelId;
          const patch = getChannelModelBindingPatch({
            channel: await readChannelForModel(model),
            model
          });
          assertValid();
          try {
            if (patch) await channels.update(channelId, patch);
          } catch (error) {
            if (!isAxiosError(error)) throw error;
            const status = error.response?.status;
            if (status !== undefined && ![500, 502, 503, 504].includes(status)) throw error;

            // 更新请求可能已提交。重读用于确认结果，不重发写入。
            const bound = await readChannelForModel(model)
              .then(({ models }) => models?.includes(model))
              .catch(() => false);
            if (!bound) {
              results.push({ status: 'unknown', model, modelId, error: error.message });
              continue;
            }
          }

          results.push({ status: 'success', model, modelId });
        } catch (error) {
          results.push({
            status: 'failed',
            model,
            ...(modelId === undefined ? {} : { modelId }),
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      return { results };
    }
  });
};
