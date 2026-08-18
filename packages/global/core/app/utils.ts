import type { AppFormEditFormType } from './formEdit/type';
import { DatasetSearchModeEnum } from '../dataset/constants';
import { NodeInputKeyEnum } from '../workflow/constants';
import { type WorkflowTemplateBasicType } from '../workflow/type';
import { AppTypeEnum } from './constants';
import appErrList from '../../common/error/code/app';
import pluginErrList from '../../common/error/code/plugin';
import { i18nT } from '../../common/i18n/utils';

const deletedPluginErrorList = new Set([
  'plugin.team_not_installed',
  'plugin.team_source_forbidden',
  'plugin.team_id_required',
  'plugin.team_source_install_failed',
  'plugin.version_required'
]);

export const getDefaultAppForm = (): AppFormEditFormType => {
  return {
    aiSettings: {
      model: '',
      isResponseAnswerText: true,
      maxHistories: 6
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
      datasetSearchExtensionBg: '',
      [NodeInputKeyEnum.authTmbId]: false
    },
    selectedTools: [],
    selectedAgentSkills: [],
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
    return AppTypeEnum.workflowTool;
  }
  return '';
};

export const formatToolError = (error?: any) => {
  if (!error || typeof error !== 'string') return;

  if (deletedPluginErrorList.has(error)) return i18nT('common:error.tool_not_exist');

  const errorText = appErrList[error]?.message || pluginErrList[error]?.message;

  return errorText || error;
};
