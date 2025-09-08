import type { AppFormEditFormType } from '../app/type';
import { DatasetSearchModeEnum } from '../dataset/constants';
import { type WorkflowTemplateBasicType } from '../workflow/type';
import { AppTypeEnum } from './constants';
import appErrList from '../../common/error/code/app';
import pluginErrList from '../../common/error/code/plugin';

export const getDefaultAppForm = (): AppFormEditFormType => {
  return {
    aiSettings: {
      model: '',
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

export const getAppType = (config?: WorkflowTemplateBasicType | AppFormEditFormType) => {
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
