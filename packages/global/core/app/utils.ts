import type { AppFormEditFormType, SelectedToolItemType } from './formEdit/type';
import type { AppFileSelectConfigType } from './type/config.schema';
import { DatasetSearchModeEnum } from '../dataset/constants';
import { rerankCandidateNumRange } from '../dataset/search/utils';
import { NodeInputKeyEnum } from '../workflow/constants';
import { FlowNodeTypeEnum } from '../workflow/node/constant';
import { type WorkflowTemplateBasicType } from '../workflow/type';
import type { StoreNodeItemType } from '../workflow/type/node';
import { hasDebugPromptRef } from '../workflow/node/agent/promptRef/legacy';
import { AppTypeEnum } from './constants';
import { hasDebugToolInSelectedTools, isDebugToolSource } from './tool/utils';

const deletedPluginErrorList = new Set([
  'plugin.team_not_installed',
  'plugin.team_source_forbidden',
  'plugin.team_id_required',
  'plugin.team_source_install_failed',
  'plugin.version_required'
]);

/** 判断工具错误是否代表工具已被删除、卸载或当前来源不可用。 */
export const isToolNotExistError = (error?: unknown) =>
  typeof error === 'string' && deletedPluginErrorList.has(error);

/** 判断应用文件选择配置是否开启了任一上传类型，统一前后端文件能力判定口径。 */
export const hasEnabledFileSelect = (fileSelectConfig?: AppFileSelectConfigType) =>
  Boolean(
    fileSelectConfig?.canSelectFile ||
    fileSelectConfig?.canSelectImg ||
    fileSelectConfig?.canSelectVideo ||
    fileSelectConfig?.canSelectAudio ||
    fileSelectConfig?.canSelectCustomFileExtension
  );

/**
 * 检查发布数据中是否包含本地调试工具。
 * 需要同时覆盖普通工具节点、工具集配置、Agent 节点 selectedTools 与系统提示词中的残留 debug 引用，避免调试 source 被发布到线上版本。
 */
export function hasDebugToolInNodes(nodes?: StoreNodeItemType[] | null) {
  return (
    nodes?.some((node) => {
      if (isDebugToolSource(node.source)) return true;

      const toolConfig = node.toolConfig;
      if (isDebugToolSource(toolConfig?.systemTool?.source)) return true;
      if (isDebugToolSource(toolConfig?.systemToolSet?.source)) return true;

      const selectedToolsInput = node.inputs.find(
        (input) => input.key === NodeInputKeyEnum.selectedTools
      );
      const selectedTools = Array.isArray(selectedToolsInput?.value)
        ? (selectedToolsInput.value as SelectedToolItemType[])
        : [];

      if (hasDebugToolInSelectedTools(selectedTools)) return true;

      // Agent 节点系统提示词可能残留已删工具的 debug 引用，发布前一并拦截。
      if (node.flowNodeType === FlowNodeTypeEnum.agent) {
        const promptInput = node.inputs.find(
          (input) => input.key === NodeInputKeyEnum.aiSystemPrompt
        );
        if (typeof promptInput?.value === 'string' && hasDebugPromptRef(promptInput.value)) {
          return true;
        }
      }

      return false;
    }) ?? false
  );
}

export const getDefaultAppForm = (): AppFormEditFormType => {
  return {
    aiSettings: {
      isResponseAnswerText: true,
      maxHistories: 6
    },
    dataset: {
      datasets: [],
      similarity: 0.4,
      limit: 3000,
      searchMode: DatasetSearchModeEnum.embedding,
      usingReRank: false,
      rerankWeight: 0.5,
      rerankCandidateNum: rerankCandidateNumRange.default,
      datasetSearchUsingExtensionQuery: false,
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

  if (!('nodes' in config) || !Array.isArray(config.nodes)) return '';
  if (
    config.nodes.some(
      (node: { flowNodeType?: string }) => node?.flowNodeType === FlowNodeTypeEnum.workflowStart
    )
  ) {
    return AppTypeEnum.workflow;
  }
  if (
    config.nodes.some(
      (node: { flowNodeType?: string }) => node?.flowNodeType === FlowNodeTypeEnum.pluginInput
    )
  ) {
    return AppTypeEnum.workflowTool;
  }
  return '';
};
