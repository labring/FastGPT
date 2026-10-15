import { NodeInputKeyEnum } from '../constants';
import { ModelTypeEnum } from '../../ai/constants';
import { i18nT } from '../../../common/i18n/utils';

export const workflowSystemModelSlots = [
  {
    legacyKey: NodeInputKeyEnum.aiModel,
    modelIdKey: NodeInputKeyEnum.aiModelId,
    label: i18nT('common:core.ai.Model'),
    type: ModelTypeEnum.llm,
    feature: 'node_model',
    featureKey: undefined,
    defaultWhenEmpty: false
  },
  {
    legacyKey: NodeInputKeyEnum.datasetSearchRerankModel,
    modelIdKey: NodeInputKeyEnum.datasetSearchRerankModelId,
    label: i18nT('common:core.dataset.search.ReRank'),
    type: ModelTypeEnum.rerank,
    feature: 'rerank',
    featureKey: NodeInputKeyEnum.datasetSearchUsingReRank,
    defaultWhenEmpty: true
  },
  {
    legacyKey: NodeInputKeyEnum.datasetSearchExtensionModel,
    modelIdKey: NodeInputKeyEnum.datasetSearchExtensionModelId,
    label: i18nT('common:core.module.template.Query extension'),
    type: ModelTypeEnum.llm,
    feature: 'query_extension',
    featureKey: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
    defaultWhenEmpty: true
  },
  {
    legacyKey: NodeInputKeyEnum.datasetDeepSearchModel,
    modelIdKey: NodeInputKeyEnum.datasetDeepSearchModelId,
    label: i18nT('common:deep_rag_search'),
    type: ModelTypeEnum.llm,
    feature: 'node_model',
    featureKey: NodeInputKeyEnum.datasetDeepSearch,
    defaultWhenEmpty: false
  }
] as const;

export const workflowDatasetParamModelSlots = [
  workflowSystemModelSlots[1],
  workflowSystemModelSlots[2]
] as const;

export const workflowModelKeyMappings = workflowSystemModelSlots.map(
  ({ legacyKey, modelIdKey }) => [legacyKey, modelIdKey] as const
);
