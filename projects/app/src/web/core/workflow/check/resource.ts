import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import { getToolConfigStatus } from '@fastgpt/global/core/app/formEdit/utils';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowBindingRequirement } from '@fastgpt/workflow-core/binding/type';
import type { WorkflowRuleIssue } from '../type';
import { resolvePluginDataErrorIssueCode } from './error';

/** 展示当前节点的资源状态与外部绑定缺项；bindings 已按节点分组，不重跑模型、普通输入、图或 ACL 校验。 */
export const checkWorkflowNodeResourceRules = ({
  data,
  bindings
}: {
  data: FlowNodeItemType;
  bindings: WorkflowBindingRequirement[];
}): WorkflowRuleIssue[] => {
  const issues: WorkflowRuleIssue[] = [];
  const inputs = new Map(data.inputs.map((input) => [input.key, input]));
  if ((data.status ?? data.pluginData?.status) === PluginStatusEnum.Offline) {
    issues.push({ code: 'tool_offline' });
  } else if (data.pluginData?.error) {
    issues.push({ code: resolvePluginDataErrorIssueCode(data.pluginData.error) });
  }

  /** 资源删除/权限标记来自服务端快照，不根据客户端身份重新鉴权。 */
  const addResourceIssues = (value: unknown, inputKey: string) => {
    if (!Array.isArray(value)) return;
    if (value.some((item) => item?.error === 'resource_no_permission')) {
      issues.push({ code: 'resource_no_permission', inputKey });
    }
    if (value.some((item) => item?.error && item.error !== 'resource_no_permission')) {
      issues.push({ code: 'resource_missing', inputKey });
    }
  };
  for (const key of [NodeInputKeyEnum.datasetSelectList, NodeInputKeyEnum.skills]) {
    addResourceIssues(inputs.get(key)?.value, key);
  }
  const datasetParams = inputs.get(NodeInputKeyEnum.datasetParams)?.value;
  if (
    data.flowNodeType === FlowNodeTypeEnum.agent &&
    datasetParams &&
    typeof datasetParams === 'object' &&
    !Array.isArray(datasetParams)
  ) {
    addResourceIssues(datasetParams.datasets, NodeInputKeyEnum.datasetParams);
  }

  /**
   * Agent 内部工具没有独立节点，资源状态和配置完整性都保存在 selectedTools 的值里。
   * 这里只读取服务端已注入的字段，不在前端重新鉴权或请求资源。
   */
  if (data.flowNodeType === FlowNodeTypeEnum.agent) {
    const addAgentIssue = (issue: WorkflowRuleIssue) => {
      if (!issues.some((item) => item.code === issue.code && item.inputKey === issue.inputKey)) {
        issues.push(issue);
      }
    };

    const selectedToolsInput = inputs.get(NodeInputKeyEnum.selectedTools);
    const selectedTools =
      selectedToolsInput && !nodeInputIsReference(selectedToolsInput)
        ? (Array.isArray(selectedToolsInput.value) ? selectedToolsInput.value : []).filter(
            (item): item is Record<string, any> => !!item && typeof item === 'object'
          )
        : [];
    const selectedToolIds = new Set(
      selectedTools
        .flatMap((tool) => [tool.pluginId, tool.id])
        .filter(Boolean)
        .map(String)
    );

    selectedTools.forEach((tool) => {
      const status = tool.status ?? tool.pluginData?.status;
      if (status === PluginStatusEnum.Offline) {
        addAgentIssue({
          code: 'tool_offline',
          inputKey: NodeInputKeyEnum.selectedTools
        });
        return;
      }
      if (tool.pluginData?.error) {
        addAgentIssue({
          code: resolvePluginDataErrorIssueCode(tool.pluginData.error),
          inputKey: NodeInputKeyEnum.selectedTools
        });
        return;
      }
      if (tool.configStatus === 'invalid') {
        addAgentIssue({
          code: 'tool_inactive',
          inputKey: NodeInputKeyEnum.selectedTools
        });
        return;
      }

      // Agent V2 生成的紧凑工具配置只有 { key, mode }，没有完整 input 定义，跳过静态配置推断。
      const hasFullInputs =
        Array.isArray(tool.inputs) &&
        tool.inputs.some((input) => Array.isArray((input as any)?.renderTypeList));
      const configStatus =
        tool.configStatus ??
        (hasFullInputs ? getToolConfigStatus({ tool: tool as any }).status : undefined);
      if (configStatus === 'waitingForConfig') {
        addAgentIssue({
          code: 'tool_waiting_config',
          inputKey: NodeInputKeyEnum.selectedTools
        });
      }
    });

    const useAgentSandbox = inputs.get(NodeInputKeyEnum.useAgentSandbox)?.value === true;
    const hasDataset = (() => {
      const datasetValue = inputs.get(NodeInputKeyEnum.datasetSelectList);
      if (datasetValue) {
        if (nodeInputIsReference(datasetValue)) return true;
        if (Array.isArray(datasetValue.value) && datasetValue.value.length > 0) return true;
      }
      const datasetParamsValue = inputs.get(NodeInputKeyEnum.datasetParams);
      if (datasetParamsValue) {
        if (nodeInputIsReference(datasetParamsValue)) return true;
        return (
          Array.isArray((datasetParamsValue.value as { datasets?: unknown })?.datasets) &&
          (datasetParamsValue.value as { datasets: unknown[] }).datasets.length > 0
        );
      }
      return false;
    })();
    const fileInput = inputs.get(NodeInputKeyEnum.fileUrlList);
    const hasFileInput =
      !!fileInput && getSelectedInputRenderType(fileInput) !== FlowNodeInputTypeEnum.off;

    if (selectedToolIds.has(SubAppIds.datasetSearch) && !hasDataset) {
      addAgentIssue({
        code: 'tool_waiting_config',
        inputKey: NodeInputKeyEnum.datasetSelectList
      });
    }
    if (selectedToolIds.has(SubAppIds.readFiles) && !hasFileInput) {
      addAgentIssue({
        code: 'tool_waiting_config',
        inputKey: NodeInputKeyEnum.fileUrlList
      });
    }
    if (selectedToolIds.has(AGENT_SANDBOX_TOOLSET_ID) && !useAgentSandbox) {
      addAgentIssue({
        code: 'tool_waiting_config',
        inputKey: NodeInputKeyEnum.useAgentSandbox
      });
    }

    const skillsInput = inputs.get(NodeInputKeyEnum.skills);
    if (
      skillsInput &&
      !nodeInputIsReference(skillsInput) &&
      Array.isArray(skillsInput.value) &&
      skillsInput.value.length > 0 &&
      !useAgentSandbox
    ) {
      addAgentIssue({
        code: 'tool_waiting_config',
        inputKey: NodeInputKeyEnum.skills
      });
    }
  }

  // Core 允许生成时暂不绑定外部资源；Web 运行/发布沿用可见必填资源必须已选择的规则。
  for (const binding of bindings) {
    if (binding.status !== 'missing' || !binding.resourceKind || binding.resourceKind === 'model')
      continue;
    const input = inputs.get(binding.inputKey);
    if (!input?.required || !input.valueType || input.valueType === WorkflowIOValueTypeEnum.boolean)
      continue;
    const renderType = getSelectedInputRenderType(input);
    if (renderType === FlowNodeInputTypeEnum.hidden || renderType === FlowNodeInputTypeEnum.off)
      continue;
    issues.push({ code: 'required_input_empty', inputKey: input.key, input });
  }
  return issues;
};
