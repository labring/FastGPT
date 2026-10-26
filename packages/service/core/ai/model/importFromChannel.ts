import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  ApplyChangesBody,
  ApplyChangesResponse,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { aiProxyClient } from '../../../thirdProvider/aiproxy/client';
import { getSystemModelHandle } from './catalog/service';
import { getCachedTypeMetas } from './channel/cache';
import { updateModelChannelBindings } from './channel/binding';
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
    aiProxyClient.getSystemChannelModels(channelId),
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

  for (const operation of operations) {
    let modelId: string | undefined =
      operation.action === 'associate' ? operation.modelId : undefined;
    try {
      // 3. 每条操作重读渠道状态，别名与关联可能已被前序操作或并发请求更新。
      const channel = await resolveChannelForOperation({
        id: channelId,
        channelType: 'system',
        tmbId
      });
      // 4. 先解析目标模型并检查别名冲突，避免创建后才发现无法安全映射。
      const model = (() => {
        if (operation.action === 'create') return operation.providerModelSlug;
        const existingModel = modelById.get(operation.modelId);
        if (!existingModel) throw new Error('系统模型不存在');
        return existingModel.model;
      })();

      const modelMapping = channel.model_mapping ?? {};
      const mappedProviderModelSlug = modelMapping[model];
      if (
        mappedProviderModelSlug !== undefined &&
        mappedProviderModelSlug !== operation.providerModelSlug
      ) {
        throw new Error('渠道别名已映射到其他上游模型');
      }

      // 已有关联时跳过重复绑定；缺少别名时仍补映射，并应用本次启停选择。
      const alreadyAssociated =
        operation.action === 'associate' && (channel.models ?? []).includes(model);

      if (!alreadyAssociated) {
        if (operation.action === 'create') {
          // 5. 先保存创建 ID；后续别名或绑定失败仍需在结果中返回该 ID。
          const createdModel = await createModel({
            modelData: {
              ...operation.modelData,
              model,
              scope: ModelScopeEnum.system,
              isActive: operation.isActive
            },
            channelType: 'system',
            tmbId,
            teamId
          });
          modelId = createdModel.modelId;
        }
      }

      if (model !== operation.providerModelSlug && mappedProviderModelSlug === undefined) {
        await aiProxyClient.system.channels.update(channelId, {
          model_mapping: {
            ...modelMapping,
            [model]: operation.providerModelSlug
          }
        });
      }

      if (!alreadyAssociated) {
        await updateModelChannelBindings({
          model,
          addChannelIds: [channelId],
          channelType: 'system',
          tmbId
        });
      }

      if (operation.action === 'associate') {
        await updateModelStatus({
          modelIds: [operation.modelId],
          isActive: operation.isActive,
          channelType: 'system',
          tmbId,
          teamId
        });
      }

      const resolvedModelId = modelId;
      if (!resolvedModelId) throw new Error('创建的系统模型缺少 ID');
      results.push(
        alreadyAssociated && operation.action === 'associate'
          ? {
              action: 'associate',
              status: 'skipped',
              modelId: resolvedModelId,
              providerModelSlug: operation.providerModelSlug
            }
          : {
              action: operation.action,
              status: 'success',
              modelId: resolvedModelId,
              providerModelSlug: operation.providerModelSlug
            }
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
