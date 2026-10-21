import { WorkflowCheckIssueCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';
import {
  getAgentToolRuntimeStatus,
  isToolInputValueConfigured
} from '@fastgpt/global/core/app/formEdit/utils';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowBindingRequirement } from '@fastgpt/workflow-core/binding/type';
import type { WorkflowRuleIssue } from '../type';
import { type SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { resolvePluginDataErrorIssueCode } from './error';

export type WorkflowSandboxCheckData = {
  showSandbox?: boolean;
  enableSandbox?: boolean;
};

/** 沙盒依赖规则与展示解耦，表单与画布巡检、运行和发布共用同一结果。 */
export const checkAgentSandboxIssues = ({
  useAgentSandbox,
  hasSkills,
  showSandbox,
  enableSandbox
}: WorkflowSandboxCheckData & {
  useAgentSandbox: boolean;
  hasSkills: boolean;
}): WorkflowRuleIssue[] => {
  if (hasSkills && (!useAgentSandbox || !showSandbox || !enableSandbox)) {
    return [
      {
        code: WorkflowCheckIssueCodeEnum.sandboxSkillUnavailable,
        inputKey: NodeInputKeyEnum.skills
      }
    ];
  }
  if (!useAgentSandbox) return [];
  if (!showSandbox) {
    return [
      {
        code: WorkflowCheckIssueCodeEnum.sandboxSystemUnavailable,
        inputKey: NodeInputKeyEnum.useAgentSandbox
      }
    ];
  }
  if (!enableSandbox) {
    return [
      {
        code: WorkflowCheckIssueCodeEnum.sandboxPlanUnavailable,
        inputKey: NodeInputKeyEnum.useAgentSandbox
      }
    ];
  }
  return [];
};

/** 扫描 Agent 内嵌资源；保留出错工具供表单展示精确错误，画布使用对应的 Agent 汇总文案。 */
export const checkAgentResourceIssues = ({
  selectedTools = [],
  skills = [],
  datasets = [],
  datasetInputKey = NodeInputKeyEnum.datasetSelectList
}: {
  selectedTools?: SelectedToolItemType[];
  skills?: { error?: string }[];
  datasets?: { error?: string }[];
  datasetInputKey?: string;
}): (WorkflowRuleIssue & { tool?: SelectedToolItemType })[] => {
  const issues: (WorkflowRuleIssue & { tool?: SelectedToolItemType })[] = [];
  for (const tool of selectedTools) {
    const status = getAgentToolRuntimeStatus(tool);
    if (status !== 'invalid' && status !== 'offline' && status !== 'waitingForConfig') continue;
    issues.push({
      code: WorkflowCheckIssueCodeEnum.agentToolAbnormal,
      inputKey: NodeInputKeyEnum.selectedTools,
      tool
    });
  }
  for (const { items, inputKey, messageCode } of [
    {
      items: datasets,
      inputKey: datasetInputKey,
      messageCode: WorkflowCheckIssueCodeEnum.agentDatasetAbnormal
    },
    {
      items: skills,
      inputKey: NodeInputKeyEnum.skills,
      messageCode: WorkflowCheckIssueCodeEnum.agentSkillAbnormal
    }
  ]) {
    for (const item of items) {
      if (!item.error) continue;
      issues.push({
        code:
          item.error === WorkflowCheckIssueCodeEnum.resourceNoPermission
            ? WorkflowCheckIssueCodeEnum.resourceNoPermission
            : WorkflowCheckIssueCodeEnum.resourceMissing,
        inputKey,
        messageCode
      });
    }
  }
  return issues;
};

/** 展示当前节点的资源状态与外部绑定缺项；bindings 已按节点分组，不重跑模型、普通输入、图或 ACL 校验。 */
export const checkWorkflowNodeResourceRules = ({
  data,
  bindings,
  sandbox,
  checkAgentResources = true
}: {
  data: FlowNodeItemType;
  bindings: WorkflowBindingRequirement[];
  sandbox?: WorkflowSandboxCheckData;
  checkAgentResources?: boolean;
}): WorkflowRuleIssue[] => {
  const issues: WorkflowRuleIssue[] = [];
  const mcpToolSet = data.toolConfig?.mcpToolSet;
  const httpToolSet = data.toolConfig?.httpToolSet;
  if (
    data.flowNodeType === FlowNodeTypeEnum.toolSet &&
    !data.pluginId &&
    mcpToolSet &&
    'toolList' in mcpToolSet &&
    !mcpToolSet.toolList?.length
  ) {
    issues.push({ code: WorkflowCheckIssueCodeEnum.toolSetNotConfigured });
  }
  if (
    data.flowNodeType === FlowNodeTypeEnum.toolSet &&
    !data.pluginId &&
    httpToolSet &&
    'toolList' in httpToolSet &&
    !httpToolSet.toolList?.length
  ) {
    issues.push({ code: WorkflowCheckIssueCodeEnum.toolSetNotConfigured });
  }

  const inputs = new Map(data.inputs.map((input) => [input.key, input]));
  if ((data.status ?? data.pluginData?.status) === PluginStatusEnum.Offline) {
    issues.push({ code: WorkflowCheckIssueCodeEnum.toolOffline });
  } else if (data.pluginData?.error) {
    issues.push({ code: resolvePluginDataErrorIssueCode(data.pluginData.error) });
  }

  // 密钥激活是运行/发布前置条件，普通串联工具与 selectedTools 挂载工具都需要检查。
  const systemInputConfig = inputs.get(NodeInputKeyEnum.systemInputConfig);
  if (systemInputConfig && !isToolInputValueConfigured({ input: systemInputConfig })) {
    issues.push({
      code: WorkflowCheckIssueCodeEnum.toolWaitingConfig,
      inputKey: NodeInputKeyEnum.systemInputConfig
    });
  }

  /** 资源删除/权限标记来自服务端快照，不根据客户端身份重新鉴权。 */
  const addResourceIssues = (value: unknown, inputKey: string) => {
    if (!Array.isArray(value)) return;
    if (value.some((item) => item?.error === WorkflowCheckIssueCodeEnum.resourceNoPermission)) {
      issues.push({
        code: WorkflowCheckIssueCodeEnum.resourceNoPermission,
        inputKey
      });
    }
    if (
      value.some(
        (item) => item?.error && item.error !== WorkflowCheckIssueCodeEnum.resourceNoPermission
      )
    ) {
      issues.push({
        code: WorkflowCheckIssueCodeEnum.resourceMissing,
        inputKey
      });
    }
  };
  const isAgentNode = data.flowNodeType === FlowNodeTypeEnum.agent;
  if (isAgentNode && checkAgentResources) {
    // 与 getAgentDatasetParams 一致：存在聚合配置时，资源检查只使用其中的知识库。
    const datasetParams = inputs.get(NodeInputKeyEnum.datasetParams)?.value;
    const datasets = datasetParams
      ? datasetParams.datasets
      : inputs.get(NodeInputKeyEnum.datasetSelectList)?.value;
    const skills = inputs.get(NodeInputKeyEnum.skills)?.value;
    const tools = inputs.get(NodeInputKeyEnum.selectedTools)?.value;
    issues.push(
      ...checkAgentResourceIssues({
        selectedTools: Array.isArray(tools)
          ? tools.filter((tool) => tool && typeof tool === 'object')
          : [],
        skills: Array.isArray(skills) ? skills : [],
        datasets: Array.isArray(datasets) ? datasets : [],
        datasetInputKey: datasetParams
          ? NodeInputKeyEnum.datasetParams
          : NodeInputKeyEnum.datasetSelectList
      })
    );
  } else if (!isAgentNode) {
    addResourceIssues(
      inputs.get(NodeInputKeyEnum.datasetSelectList)?.value,
      NodeInputKeyEnum.datasetSelectList
    );
    addResourceIssues(inputs.get(NodeInputKeyEnum.skills)?.value, NodeInputKeyEnum.skills);
  }
  if (
    checkAgentResources &&
    sandbox &&
    (isAgentNode || data.flowNodeType === FlowNodeTypeEnum.toolCall)
  ) {
    const skills = inputs.get(NodeInputKeyEnum.skills)?.value;
    issues.push(
      ...checkAgentSandboxIssues({
        ...sandbox,
        useAgentSandbox: Boolean(inputs.get(NodeInputKeyEnum.useAgentSandbox)?.value),
        hasSkills: isAgentNode && Array.isArray(skills) && skills.length > 0
      })
    );
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
    issues.push({
      code: WorkflowCheckIssueCodeEnum.requiredInputEmpty,
      inputKey: input.key,
      input
    });
  }
  return issues;
};
