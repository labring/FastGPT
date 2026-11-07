import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { DatasetConfigAuditItemEnum } from '@fastgpt/global/core/dataset/audit/constants/config';
import type { ModelReferenceType } from '@fastgpt/global/core/ai/model/schema';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type { ModelHandle } from '../../ai/model/catalog/handle';
import { getDatasetModelReference } from '../model';
import { buildDatasetConfigAuditChanges } from './utils';

type DatasetAuditModelData = { modelId?: string; model?: string; name?: string };

/**
 * 解析模型审计用的稳定身份和展示名称；身份始终优先使用 modelId，名称只用于日志文案。
 * 历史数据仅存 model 时继续以旧标识作身份，并优先展示目录名称或旧 model 名称。
 */
export const resolveDatasetAuditModel = ({
  reference,
  modelData
}: {
  reference: ModelReferenceType;
  modelData?: DatasetAuditModelData;
}) => {
  const legacyModel =
    reference.model && reference.model !== reference.modelId ? reference.model : undefined;

  return {
    modelId: modelData?.modelId || reference.modelId || legacyModel || '',
    modelName: modelData?.name || modelData?.model || legacyModel || i18nT('common:UnKnow')
  };
};

/**
 * 为知识库更新请求汇总待写入的配置审计条目；此函数只计算日志，不执行写入。
 * 未提交的字段会跳过，VLM 显式清空仍会保留旧名称作为旧值；模型按稳定 ID 判断变更，名称只用于展示。
 * 第三方来源配置必须传入与 Mongo dotted update 合并后的有效值，避免把未提交的子字段误记为删除。
 */
export const buildDatasetUpdateAuditLogs = ({
  dataset,
  modelHandle,
  update
}: {
  dataset: DatasetSchemaType;
  modelHandle: ModelHandle;
  update: {
    name?: string;
    intro?: string;
    avatar?: string;
    agentModelId?: string | null;
    agentModel?: string | null;
    agentModelData?: DatasetAuditModelData;
    vlmModelId?: string | null;
    vlmModel?: string | null;
    vlmModelData?: DatasetAuditModelData;
    clearVlmModel: boolean;
    websiteConfig?: unknown;
    externalReadUrl?: string;
    apiDatasetServer: { enabled: boolean; value?: unknown };
    autoSync?: boolean;
    chunkSettings?: unknown;
    chunkSettingsEnabled: boolean;
    fileParseConfig?: unknown;
  };
}) => {
  const agentReference = getDatasetModelReference(dataset, 'agent');
  const oldAgentModel = resolveDatasetAuditModel({
    reference: agentReference,
    modelData: modelHandle.findModelData(agentReference, { type: 'llm', vision: false })
  });
  const newAgentModel = update.agentModelData
    ? resolveDatasetAuditModel({
        reference: {
          modelId: update.agentModelData.modelId,
          model: update.agentModelData.model
        },
        modelData: update.agentModelData
      })
    : undefined;

  const vlmReference = getDatasetModelReference(dataset, 'vlm');
  const oldVlmModel = resolveDatasetAuditModel({
    reference: vlmReference,
    modelData: modelHandle.findModelData(vlmReference, { type: 'llm', vision: true })
  });
  const newVlmModel = update.vlmModelData
    ? resolveDatasetAuditModel({
        reference: { modelId: update.vlmModelData.modelId, model: update.vlmModelData.model },
        modelData: update.vlmModelData
      })
    : undefined;

  return [
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.NAME,
      oldValue: dataset.name,
      newValue: update.name,
      enabled: Boolean(update.name)
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.INTRO,
      oldValue: dataset.intro,
      newValue: update.intro,
      enabled: update.intro !== undefined
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.AVATAR,
      oldValue: dataset.avatar,
      newValue: update.avatar,
      enabled: Boolean(update.avatar)
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.AGENT_MODEL,
      oldValue: oldAgentModel.modelName,
      newValue: newAgentModel?.modelName,
      compareValues: {
        oldValue: oldAgentModel.modelId,
        newValue: newAgentModel?.modelId ?? ''
      },
      enabled:
        (update.agentModelId !== undefined || update.agentModel !== undefined) &&
        !!update.agentModelData
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.VLM_MODEL,
      oldValue: oldVlmModel.modelName,
      newValue: update.clearVlmModel ? undefined : newVlmModel?.modelName,
      compareValues: {
        oldValue: oldVlmModel.modelId,
        newValue: update.clearVlmModel ? '' : (newVlmModel?.modelId ?? '')
      },
      enabled:
        (update.vlmModelId !== undefined || update.vlmModel !== undefined) &&
        (update.clearVlmModel || !!update.vlmModelData)
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.WEBSITE_CONFIG,
      oldValue: dataset.websiteConfig,
      newValue: update.websiteConfig,
      enabled: update.websiteConfig !== undefined
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.EXTERNAL_READ_URL,
      oldValue: dataset.externalReadUrl,
      newValue: update.externalReadUrl,
      enabled: update.externalReadUrl !== undefined
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.API_DATASET_SERVER,
      oldValue: dataset.apiDatasetServer,
      newValue: update.apiDatasetServer.value,
      enabled: update.apiDatasetServer.enabled
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.AUTO_SYNC,
      oldValue: dataset.autoSync,
      newValue: update.autoSync,
      enabled: typeof update.autoSync === 'boolean'
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.CHUNK_SETTINGS,
      oldValue: dataset.chunkSettings,
      newValue: update.chunkSettings,
      enabled: update.chunkSettingsEnabled
    }),
    ...buildDatasetConfigAuditChanges({
      item: DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG,
      oldValue: dataset.sangforFileParseConfig,
      newValue: update.fileParseConfig,
      enabled: update.fileParseConfig !== undefined
    })
  ];
};
