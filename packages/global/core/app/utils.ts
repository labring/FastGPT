import type { AppChatConfigType, AppSimpleEditFormType } from '../app/type';
import { FlowNodeTypeEnum } from '../workflow/node/constant';
import { NodeInputKeyEnum, FlowNodeTemplateTypeEnum } from '../workflow/constants';
import type { FlowNodeInputItemType } from '../workflow/type/io.d';
import { getAppChatConfig } from '../workflow/utils';
import { type StoreNodeItemType } from '../workflow/type/node';
import { DatasetSearchModeEnum } from '../dataset/constants';
import { type WorkflowTemplateBasicType } from '../workflow/type';
import { AppTypeEnum } from './constants';
import appErrList from '../../common/error/code/app';
import pluginErrList from '../../common/error/code/plugin';

export const getDefaultAppForm = (): AppSimpleEditFormType => {
  return {
    aiSettings: {
      model: 'gpt-4o-mini',
      systemPrompt: '',
      temperature: 0,
      isResponseAnswerText: true,
      maxHistories: 6,
      maxToken: 4000,
      aiChatReasoning: true
    },
    dataset: {
      datasets: [],
      similarity: 0.4,
      limit: 3000,
      searchMode: DatasetSearchModeEnum.embedding,
      usingReRank: true,
      rerankModel: '',
      rerankWeight: 0.5,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionBg: ''
    },
    selectedTools: [],
    chatConfig: {}
  };
};

/* format app nodes to edit form */
export const appWorkflow2Form = ({
  nodes,
  chatConfig
}: {
  nodes: StoreNodeItemType[];
  chatConfig: AppChatConfigType;
}) => {
  const defaultAppForm = getDefaultAppForm();
  const findInputValueByKey = (inputs: FlowNodeInputItemType[], key: string) => {
    return inputs.find((item) => item.key === key)?.value;
  };

  nodes.forEach((node) => {
    if (
      node.flowNodeType === FlowNodeTypeEnum.chatNode ||
      node.flowNodeType === FlowNodeTypeEnum.tools
    ) {
      defaultAppForm.aiSettings.model = findInputValueByKey(node.inputs, NodeInputKeyEnum.aiModel);
      defaultAppForm.aiSettings.systemPrompt = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiSystemPrompt
      );
      defaultAppForm.aiSettings.temperature = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatTemperature
      );
      defaultAppForm.aiSettings.maxToken = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatMaxToken
      );
      defaultAppForm.aiSettings.maxHistories = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.history
      );
      defaultAppForm.aiSettings.aiChatReasoning = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatReasoning
      );
      defaultAppForm.aiSettings.aiChatTopP = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatTopP
      );
      defaultAppForm.aiSettings.aiChatStopSign = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatStopSign
      );
      defaultAppForm.aiSettings.aiChatResponseFormat = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatResponseFormat
      );
      defaultAppForm.aiSettings.aiChatJsonSchema = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.aiChatJsonSchema
      );
    } else if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
      defaultAppForm.dataset.datasets = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSelectList
      );
      defaultAppForm.dataset.similarity = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSimilarity
      );
      defaultAppForm.dataset.limit = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetMaxTokens
      );
      defaultAppForm.dataset.searchMode =
        findInputValueByKey(node.inputs, NodeInputKeyEnum.datasetSearchMode) ||
        DatasetSearchModeEnum.embedding;
      defaultAppForm.dataset.embeddingWeight = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchEmbeddingWeight
      );
      // Rerank
      defaultAppForm.dataset.usingReRank = !!findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchUsingReRank
      );
      defaultAppForm.dataset.rerankModel = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchRerankModel
      );
      defaultAppForm.dataset.rerankWeight = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchRerankWeight
      );
      // Query extension
      defaultAppForm.dataset.datasetSearchUsingExtensionQuery = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchUsingExtensionQuery
      );
      defaultAppForm.dataset.datasetSearchExtensionModel = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchExtensionModel
      );
      defaultAppForm.dataset.datasetSearchExtensionBg = findInputValueByKey(
        node.inputs,
        NodeInputKeyEnum.datasetSearchExtensionBg
      );
    } else if (
      node.flowNodeType === FlowNodeTypeEnum.pluginModule ||
      node.flowNodeType === FlowNodeTypeEnum.appModule ||
      node.flowNodeType === FlowNodeTypeEnum.tool ||
      node.flowNodeType === FlowNodeTypeEnum.toolSet
    ) {
      if (!node.pluginId) return;

      defaultAppForm.selectedTools.push({
        id: node.nodeId,
        pluginId: node.pluginId,
        name: node.name,
        avatar: node.avatar,
        intro: node.intro || '',
        flowNodeType: node.flowNodeType,
        showStatus: node.showStatus,
        version: node.version,
        inputs: node.inputs,
        outputs: node.outputs,
        templateType: FlowNodeTemplateTypeEnum.other,
        pluginData: node.pluginData
      });
    } else if (node.flowNodeType === FlowNodeTypeEnum.systemConfig) {
      defaultAppForm.chatConfig = getAppChatConfig({
        chatConfig,
        systemConfigNode: node,
        isPublicFetch: true
      });
    }
  });

  return defaultAppForm;
};

export const getAppType = (config?: WorkflowTemplateBasicType | AppSimpleEditFormType) => {
  if (!config) return '';

  if ('aiSettings' in config) {
    return AppTypeEnum.simple;
  }

  if (!('nodes' in config)) return '';
  if (config.nodes.some((node) => node.flowNodeType === 'workflowStart')) {
    return AppTypeEnum.workflow;
  }
  if (config.nodes.some((node) => node.flowNodeType === 'pluginInput')) {
    return AppTypeEnum.plugin;
  }
  return '';
};

export const formatToolError = (error?: any) => {
  if (!error || typeof error !== 'string') return;

  const errorText = appErrList[error]?.message || pluginErrList[error]?.message;

  return errorText || error;
};
