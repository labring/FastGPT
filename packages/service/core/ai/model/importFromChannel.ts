import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import type {
  ApplyChangesBody,
  ApplyChangesResponse,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import { getSystemModelHandle } from './catalog/service';
import { getCachedTypeMetas } from './channel/cache';
import { getChannelModelBindingPatch } from './channel/binding';
import { resolveChannelForOperation } from './channel/resolve';
import { getModelProviders } from './provider/controller';
import { createModel, updateModelStatus } from './service';
import { refreshModelTemplates } from './template';
import { classifyChannelModels, inferFastGPTProvider } from './importFromChannelUtils';

/**
 * 读取系统渠道的完整上游目录，并按本地模型、其他渠道关联和模板生成预览。
 */
export const previewImportFromChannel = async ({
  channelId,
  tmbId
}: Pick<ApplyChangesBody, 'channelId'> & {
  tmbId: string;
}): Promise<PreviewImportFromChannelResponse> => {
  // 1. 先校验所选渠道并读取其类型，后续映射 provider 必须基于同一渠道。
  const channel = await resolveChannelForOperation({ id: channelId, channelType: 'system', tmbId });
  // 2. 并行读取预览所需目录与 type-meta，减少多段网络/存储等待。
  const [channelModels, channels, modelHandle, templates, typeMetas] = await Promise.all([
    aiProxyClient.getSystemChannelModels(channelId).catch((error) => {
      if ((error as { status?: number })?.status === 501) {
        throw new UserError(ModelErrEnum.channelCatalogUnsupported);
      }
      throw error;
    }),
    aiProxyClient.system.channels.listAll(),
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

  // 4. 保留原始渠道别名与其他渠道占用，分类后将唯一 provider 传给空白草稿。
  return {
    items: classifyChannelModels({
      channelModels,
      localModels: modelHandle.getSystemModels(),
      targetChannelModels: channel.models ?? [],
      targetModelMappings: channel.model_mapping ?? {},
      otherChannelModels: channels
        .filter((item) => item.id !== channelId)
        .flatMap((item) => item.models ?? []),
      templates,
      provider
    })
  };
};

/**
 * 应用系统渠道导入操作，按请求顺序隔离单条失败；创建成功后的渠道绑定失败保留模型。
 */
export const applyChangesFromChannel = async ({
  channelId,
  operations,
  tmbId,
  teamId
}: Pick<ApplyChangesBody, 'channelId' | 'operations'> & {
  tmbId: string;
  teamId: string;
}): Promise<ApplyChangesResponse> => {
  // 1. 校验目标渠道后再处理空批次，避免无操作时读取系统模型目录。
  await resolveChannelForOperation({ id: channelId, channelType: 'system', tmbId });
  if (operations.length === 0) return { results: [] };

  // 2. 只读取一次模型快照，按稳定 ID 查找 associate 的来源模型。
  const models = (await getSystemModelHandle()).getSystemModels();
  const modelById = new Map(models.map((model) => [model.modelId, model]));
  const results: ApplyChangesResponse['results'] = [];
  const readChannel = () =>
    resolveChannelForOperation({ id: channelId, channelType: 'system', tmbId });

  for (const operation of operations) {
    const { providerModelSlug, isActive } = operation;
    let modelId = operation.action === 'associate' ? operation.modelId : undefined;
    try {
      // 每条都用当前渠道配置校验冲突。创建前校验一次，提交后重读再生成写入。
      const model =
        operation.action === 'create' ? providerModelSlug : modelById.get(operation.modelId)?.model;
      if (model === undefined) throw new UserError(ModelErrEnum.unExist);
      const binding = { model, upstreamModel: providerModelSlug };
      let patch = getChannelModelBindingPatch({ channel: await readChannel(), ...binding });
      if (operation.action === 'create') {
        const createdModel = await createModel({
          modelData: { ...operation.modelData, model, scope: ModelScopeEnum.system, isActive },
          channelType: 'system',
          tmbId,
          teamId
        });
        // 后续渠道写入失败时仍返回已创建的模型 ID。
        modelId = createdModel.modelId;
        patch = getChannelModelBindingPatch({ channel: await readChannel(), ...binding });
      }
      if (patch) await aiProxyClient.system.channels.update(channelId, patch);

      if (!modelId) throw new UserError(ModelErrEnum.invalidModelConfig);
      const statusChanged =
        operation.action === 'associate' &&
        (await updateModelStatus({
          modelIds: [operation.modelId],
          isActive,
          channelType: 'system',
          tmbId,
          teamId
        }));
      const result = { modelId, providerModelSlug };
      results.push(
        operation.action === 'associate' && !patch && !statusChanged
          ? { ...result, action: 'associate', status: 'skipped' }
          : { ...result, action: operation.action, status: 'success' }
      );
    } catch (error) {
      results.push({
        action: operation.action,
        status: 'failed',
        providerModelSlug: operation.providerModelSlug,
        ...(modelId === undefined ? {} : { modelId }),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { results };
};
