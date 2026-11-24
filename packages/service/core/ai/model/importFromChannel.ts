import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import type {
  ImportFromChannelBody,
  ImportFromChannelResponse,
  PreviewImportFromChannelQuery,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import { isAiproxyNotImplementedError } from '../../../thirdProvider/aiproxy/error';
import { getSystemModelHandle } from './catalog/service';
import { getCachedTypeMetas } from './channel/cache';
import { getChannelModelBindingPatch } from './channel/binding';
import { resolveChannelForOperation } from './channel/resolve';
import { getModelProviders } from './provider/controller';
import { createModel } from './service';
import { refreshModelTemplates } from './template';
import { classifyChannelModels, inferFastGPTProvider } from './importFromChannelUtils';

/**
 * 读取系统渠道的完整上游目录，筛除已有模型后生成模板导入预览。
 */
export const previewImportFromChannel = async ({
  channelId,
  tmbId
}: PreviewImportFromChannelQuery & {
  tmbId: string;
}): Promise<PreviewImportFromChannelResponse> => {
  // 1. 先校验所选渠道并读取其类型，后续映射 provider 必须基于同一渠道。
  const channel = await resolveChannelForOperation({ id: channelId, channelType: 'system', tmbId });
  // 2. 并行读取预览所需目录与 type-meta，减少多段网络/存储等待。
  const [channelModels, modelHandle, templates, typeMetas] = await Promise.all([
    aiProxyClient.getSystemChannelModels(channelId).catch((error) => {
      if (isAiproxyNotImplementedError(error)) {
        throw new UserError(ModelErrEnum.channelCatalogUnsupported);
      }
      throw error;
    }),
    getSystemModelHandle(),
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
      installedModelNames: modelHandle.getSystemModels().map(({ model }) => model),
      targetChannelModels: channel.models ?? [],
      targetModelMappings: channel.model_mapping ?? {},
      templates,
      provider
    })
  };
};

/** 逐条创建并绑定系统模型。创建完成后的关联失败保留模型并返回其 ID。 */
export const importFromChannel = async ({
  channelId,
  models,
  tmbId,
  teamId
}: ImportFromChannelBody & {
  tmbId: string;
  teamId: string;
}): Promise<ImportFromChannelResponse> => {
  const channelScope = { id: channelId, channelType: 'system' as const, tmbId };
  await resolveChannelForOperation(channelScope);

  const readChannelForModel = async (model: string) => {
    const channel = await resolveChannelForOperation(channelScope);
    const mapping = channel.model_mapping;
    // 导入直接使用上游 ID，同名别名只能指向该 ID。
    if (mapping && Object.hasOwn(mapping, model) && mapping[model] !== model) {
      throw new UserError(ModelErrEnum.channelModelMappingConflict);
    }
    return channel;
  };

  const results: ImportFromChannelResponse['results'] = [];
  for (const modelData of models) {
    const { model } = modelData;
    let modelId: string | undefined;
    try {
      // 创建前检查映射冲突，创建后重新读取关联配置。
      await readChannelForModel(model);
      const createdModel = await createModel({
        modelData: {
          ...modelData,
          scope: ModelScopeEnum.system,
          isActive: modelData.isActive ?? true
        },
        channelType: 'system',
        tmbId,
        teamId
      });
      modelId = createdModel.modelId;
      const channel = await readChannelForModel(model);
      const patch = getChannelModelBindingPatch({ channel, model });
      if (patch) await aiProxyClient.system.channels.update(channelId, patch);

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
};
