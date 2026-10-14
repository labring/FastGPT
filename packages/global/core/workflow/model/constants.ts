import { NodeInputKeyEnum } from '../constants';
import { ModelTypeEnum } from '../../ai/constants';

export const workflowSystemModelSlots = [
  {
    legacyKey: NodeInputKeyEnum.aiModel,
    modelIdKey: NodeInputKeyEnum.aiModelId,
    type: ModelTypeEnum.llm,
    feature: 'node_model',
    featureKey: undefined,
    defaultWhenEmpty: false
  },
  {
    legacyKey: NodeInputKeyEnum.datasetSearchRerankModel,
    modelIdKey: NodeInputKeyEnum.datasetSearchRerankModelId,
    type: ModelTypeEnum.rerank,
    feature: 'rerank',
    featureKey: NodeInputKeyEnum.datasetSearchUsingReRank,
    defaultWhenEmpty: true
  },
  {
    legacyKey: NodeInputKeyEnum.datasetSearchExtensionModel,
    modelIdKey: NodeInputKeyEnum.datasetSearchExtensionModelId,
    type: ModelTypeEnum.llm,
    feature: 'query_extension',
    featureKey: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
    defaultWhenEmpty: true
  },
  {
    legacyKey: NodeInputKeyEnum.datasetDeepSearchModel,
    modelIdKey: NodeInputKeyEnum.datasetDeepSearchModelId,
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
