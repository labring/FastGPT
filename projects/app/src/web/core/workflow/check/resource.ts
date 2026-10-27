import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  getSelectedInputRenderType,
  isFileUrlInputConfigured,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import {
  getToolConfigStatus,
  isToolInputValueConfigured
} from '@fastgpt/global/core/app/formEdit/utils';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import { getAgentPromptToolIds } from '@fastgpt/global/core/app/tool/utils';
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

  /**
   * 把服务端注入的资源错误标记转换为资源级 issue。
   * 资源名存在时使用带名称的 Agent 文案，便于提示直接定位到具体技能/知识库。
   */
  const addResourceIssues = ({
    value,
    inputKey,
    missingMessageCode
  }: {
    value: unknown;
    inputKey: string;
    missingMessageCode: 'agent_skill_missing' | 'agent_dataset_missing';
  }) => {
    if (!Array.isArray(value)) return;

    value.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const { error, name } = item as { error?: string; name?: string };
      if (!error) return;

      if (error === 'resource_no_permission') {
        if (
          !issues.some(
            (issue) => issue.code === 'resource_no_permission' && issue.inputKey === inputKey
          )
        ) {
          issues.push({ code: 'resource_no_permission', inputKey });
        }
        return;
      }

      const resourceName = name?.trim();
      if (
        issues.some(
          (issue) =>
            issue.code === 'resource_missing' &&
            issue.inputKey === inputKey &&
            issue.resourceName === resourceName
        )
      ) {
        return;
      }

      issues.push({
        code: 'resource_missing',
        inputKey,
        ...(resourceName ? { resourceName, messageCode: missingMessageCode } : {})
      });
    });
  };

  addResourceIssues({
    value: inputs.get(NodeInputKeyEnum.datasetSelectList)?.value,
    inputKey: NodeInputKeyEnum.datasetSelectList,
    missingMessageCode: 'agent_dataset_missing'
  });
  addResourceIssues({
    value: inputs.get(NodeInputKeyEnum.skills)?.value,
    inputKey: NodeInputKeyEnum.skills,
    missingMessageCode: 'agent_skill_missing'
  });

  const datasetParams = inputs.get(NodeInputKeyEnum.datasetParams)?.value;
  if (
    data.flowNodeType === FlowNodeTypeEnum.agent &&
    datasetParams &&
    typeof datasetParams === 'object' &&
    !Array.isArray(datasetParams)
  ) {
    addResourceIssues({
      value: datasetParams.datasets,
      inputKey: NodeInputKeyEnum.datasetParams,
      missingMessageCode: 'agent_dataset_missing'
    });
  }

  /**
   * Agent 内部工具没有独立节点，资源状态和配置完整性都保存在 selectedTools 的值里。
   * 这里只读取服务端已注入的字段，不在前端重新鉴权或请求资源。
   */
  if (data.flowNodeType === FlowNodeTypeEnum.agent) {
    const addAgentIssue = (issue: WorkflowRuleIssue) => {
      // 同名资源只保留一条；不同工具/技能各自显示一条，便于按名称定位。
      if (
        !issues.some(
          (item) =>
            item.code === issue.code &&
            item.inputKey === issue.inputKey &&
            item.resourceName === issue.resourceName
        )
      ) {
        issues.push(issue);
      }
    };
    const getResourceName = (name: unknown) =>
      typeof name === 'string' && name.trim() ? name.trim() : undefined;
    /** 有资源名时使用设计稿的资源级文案，无名称时回退到通用提示。 */
    const withResourceMessage = ({
      resourceName,
      messageCode
    }: {
      resourceName?: string;
      messageCode: WorkflowRuleIssue['messageCode'];
    }) => (resourceName ? { resourceName, messageCode } : {});

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
    // 内置能力通过 @ 选择时只写入 Prompt（{{@dataset_search@}} 等），不会进入 selectedTools；
    // 这里仅把 Prompt 引用并入前置能力判断，不能写回 selectedTools 或资源快照。
    const promptInput = inputs.get(NodeInputKeyEnum.aiSystemPrompt);
    if (
      promptInput &&
      !nodeInputIsReference(promptInput) &&
      typeof promptInput.value === 'string'
    ) {
      getAgentPromptToolIds(promptInput.value).forEach((id) => selectedToolIds.add(id));
    }
    const getSelectedToolName = (id: string) =>
      getResourceName(
        selectedTools.find((tool) =>
          [tool.pluginId, tool.id].filter(Boolean).map(String).includes(id)
        )?.name
      );

    selectedTools.forEach((tool) => {
      const resourceName = getResourceName(tool.name);
      const status = tool.status ?? tool.pluginData?.status;
      if (status === PluginStatusEnum.Offline) {
        addAgentIssue({
          code: 'tool_offline',
          inputKey: NodeInputKeyEnum.selectedTools,
          ...withResourceMessage({ resourceName, messageCode: 'agent_tool_offline' })
        });
        return;
      }
      if (tool.pluginData?.error) {
        const issueCode = resolvePluginDataErrorIssueCode(tool.pluginData.error);
        addAgentIssue({
          code: issueCode,
          inputKey: NodeInputKeyEnum.selectedTools,
          // 不存在时提示资源名；无权限/加载失败保持通用文案，避免误导用户删除。
          ...(issueCode === 'tool_missing'
            ? withResourceMessage({ resourceName, messageCode: 'agent_tool_missing' })
            : {})
        });
        return;
      }
      if (tool.configStatus === 'invalid') {
        addAgentIssue({
          code: 'tool_inactive',
          inputKey: NodeInputKeyEnum.selectedTools,
          ...withResourceMessage({ resourceName, messageCode: 'agent_tool_inactive' })
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
        // systemInputConfig 未配置代表系统工具未激活；其他必填项缺失才是配置未完成。
        const systemInputConfig = Array.isArray(tool.inputs)
          ? tool.inputs.find(
              (input: any) =>
                input?.key === NodeInputKeyEnum.systemInputConfig &&
                Array.isArray(input.renderTypeList)
            )
          : undefined;
        const isInactive =
          !!systemInputConfig && !isToolInputValueConfigured({ input: systemInputConfig });
        addAgentIssue({
          code: isInactive ? 'tool_inactive' : 'tool_waiting_config',
          inputKey: NodeInputKeyEnum.selectedTools,
          ...withResourceMessage({
            resourceName,
            messageCode: isInactive ? 'agent_tool_inactive' : 'agent_tool_waiting_config'
          })
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
    const hasFileInput = isFileUrlInputConfigured(fileInput);

    if (selectedToolIds.has(SubAppIds.datasetSearch) && !hasDataset) {
      addAgentIssue({
        code: 'tool_waiting_config',
        inputKey: NodeInputKeyEnum.datasetSelectList,
        ...withResourceMessage({
          resourceName: getSelectedToolName(SubAppIds.datasetSearch),
          messageCode: 'agent_tool_waiting_config'
        })
      });
    }
    if (selectedToolIds.has(SubAppIds.readFiles) && !hasFileInput) {
      addAgentIssue({
        code: 'tool_waiting_config',
        inputKey: NodeInputKeyEnum.fileUrlList,
        ...withResourceMessage({
          resourceName: getSelectedToolName(SubAppIds.readFiles),
          messageCode: 'agent_tool_waiting_config'
        })
      });
    }
    if (selectedToolIds.has(AGENT_SANDBOX_TOOLSET_ID) && !useAgentSandbox) {
      addAgentIssue({
        code: 'tool_waiting_config',
        inputKey: NodeInputKeyEnum.useAgentSandbox,
        ...withResourceMessage({
          resourceName: getSelectedToolName(AGENT_SANDBOX_TOOLSET_ID),
          messageCode: 'agent_tool_waiting_config'
        })
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
        inputKey: NodeInputKeyEnum.skills,
        messageCode: 'agent_skill_sandbox_required'
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
