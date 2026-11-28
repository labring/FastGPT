import { channelTypeToScope } from '@fastgpt/global/core/ai/model/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import type {
  ImportFromChannelBody,
  ImportFromChannelResponse,
  PreviewImportFromChannelQuery,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { getSystemModelHandle, getTeamModelHandle } from './catalog/service';
import { bindImportedModelsToChannel, hasChannelModelMappingConflict } from './channel/binding';
import { resolveChannelForOperation } from './channel/resolve';
import { getChannelCatalogForImport } from './channel/service';
import { getModelProviders } from './provider/controller';
import { createModel } from './service';
import { refreshModelTemplates } from './template';
import { classifyChannelModels, inferFastGPTProvider } from './importFromChannelUtils';

type ChannelImportScope = PreviewImportFromChannelQuery & {
  teamId: string;
  tmbId: string;
};

/** 读取所选渠道的完整上游目录，筛除当前作用域已有模型后生成导入预览。 */
export const previewImportFromChannel = async ({
  channelId,
  channelType,
  teamId,
  tmbId
}: ChannelImportScope): Promise<PreviewImportFromChannelResponse> => {
  // 1. 并行读取渠道目录、当前作用域已安装模型和模板；渠道存在性与 501 归一化收口在渠道层。
  const [{ channel, channelModels, channelTypeName }, installedModels, templates] =
    await Promise.all([
      getChannelCatalogForImport({ channelId, channelType, tmbId }),
      channelType === 'team'
        ? getTeamModelHandle({ teamId }).then((handle) => handle.getTeamModels(tmbId))
        : getSystemModelHandle().then((handle) => handle.getSystemModels()),
      refreshModelTemplates()
    ]);

  // 2. 只在协议名与 FastGPT provider 名唯一相同时填 provider。
  const provider = inferFastGPTProvider({
    channelTypeName,
    providers: getModelProviders('en')
  });

  // 3. 使用已安装模型名和目标渠道映射精确筛除，将唯一 provider 传给空白草稿。
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
  const channel = await resolveChannelForOperation({ id: channelId, ...scope });
  const results: ImportFromChannelResponse['results'] = [];
  const created: { index: number; model: string; modelId: string }[] = [];

  // 1. 建模和目录刷新在锁外执行，避免长事务占用单渠道写锁。
  for (const [index, modelData] of models.entries()) {
    const { model } = modelData;
    if (hasChannelModelMappingConflict(channel.model_mapping, model)) {
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

  // 2. 在渠道绑定层持单渠道排队写锁合并绑定一次，并对未确认写入做权威读回对账。
  const bindResults = await bindImportedModelsToChannel({
    channelId,
    ...scope,
    models: created.map(({ model }) => model)
  });

  for (const { index, model, modelId } of created) {
    const bindResult = bindResults.get(model);
    if (!bindResult || bindResult.status === 'success') {
      results[index] = { status: 'success', model, modelId };
    } else {
      results[index] = {
        status: bindResult.status,
        model,
        modelId,
        error: bindResult.error
      };
    }
  }

  return { results };
};
