import { WorkflowCheckIssueCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';
import { isToolInputValueConfigured } from '@fastgpt/global/core/app/formEdit/utils';
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
      issues.push({ code: WorkflowCheckIssueCodeEnum.resourceNoPermission, inputKey });
    }
    if (
      value.some(
        (item) => item?.error && item.error !== WorkflowCheckIssueCodeEnum.resourceNoPermission
      )
    ) {
      issues.push({ code: WorkflowCheckIssueCodeEnum.resourceMissing, inputKey });
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
