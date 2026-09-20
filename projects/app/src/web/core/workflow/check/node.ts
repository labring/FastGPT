import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { filterSelectableWorkflowNodeOutputs } from '../utils';
import { isWorkflowSystemModelInput } from '@fastgpt/global/common/workflow/model';
import { workflowDatasetParamModelSlots } from '@fastgpt/global/core/workflow/model/constants';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import {
  isValidReferenceValueFormat,
  nodeInputIsReference,
  getSelectedInputRenderType
} from '@fastgpt/global/common/workflow/reference';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import type { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import {
  canInputBeAgentGenerated,
  initToolInputTypeByDefaultMode,
  isToolInputValueConfigured,
  isAgentGeneratedToolInput
} from '@fastgpt/global/core/app/formEdit/utils';
import { referenceValueIsLive, type WorkflowCheckContext } from './graph';
import { resolvePluginDataErrorIssueCode } from './error';
import type { WorkflowRuleIssue } from '@/web/core/workflow/type';

const workflowCheckSkipNodeRuleTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.comment
]);

/** 展示服务端资源状态及工具激活状态，不在前端重新执行 ACL。 */
export const checkWorkflowNodeResourceRules = ({
  data,
  inputMap,
  context
}: {
  data: FlowNodeItemType;
  inputMap: Map<string, FlowNodeInputItemType>;
  context: WorkflowCheckContext;
}): WorkflowRuleIssue[] => {
  const issues: WorkflowRuleIssue[] = [];
  const isToolNode = context.incomingEdgesMap
    .get(data.nodeId)
    ?.some((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools);
  const isToolOffline = (data.status ?? data.pluginData?.status) === PluginStatusEnum.Offline;
  if (isToolOffline) {
    issues.push({ code: 'tool_offline' });
  } else if (data.pluginData?.error) {
    const issueCode = resolvePluginDataErrorIssueCode(data.pluginData.error);
    issues.push({ code: issueCode });
  }

  // ACL 由保存/发布服务端按资源快照做差量校验；前端同步展示服务端返回的资源级标记，
  // 并提示已删除或不可用的实体。
  const datasetParamsInput = inputMap.get(NodeInputKeyEnum.datasetParams);
  const addResourceIssues = (value: unknown, inputKey: string) => {
    if (!Array.isArray(value)) return;
    if (
      value.some((item) => item && (item as { error?: string }).error === 'resource_no_permission')
    ) {
      issues.push({ code: 'resource_no_permission', inputKey });
    }
    if (
      value.some(
        (item) =>
          item &&
          (item as { error?: string }).error &&
          (item as { error?: string }).error !== 'resource_no_permission'
      )
    ) {
      issues.push({ code: 'resource_missing', inputKey });
    }
  };

  [NodeInputKeyEnum.datasetSelectList, NodeInputKeyEnum.skills].forEach((key) =>
    addResourceIssues(inputMap.get(key)?.value, key)
  );

  if (
    data.flowNodeType === FlowNodeTypeEnum.agent &&
    datasetParamsInput?.value &&
    typeof datasetParamsInput.value === 'object' &&
    !Array.isArray(datasetParamsInput.value)
  ) {
    addResourceIssues(
      (datasetParamsInput.value as { datasets?: unknown }).datasets,
      NodeInputKeyEnum.datasetParams
    );
  }

  // 工具调用下游工具只有 systemInputConfig 未配置时才算未激活。
  // 普通必填参数为空由下面的通用必填校验单独提示，不能复用整体工具配置状态。
  const systemInputConfig = inputMap.get(NodeInputKeyEnum.systemInputConfig);
  if (
    isToolNode &&
    systemInputConfig &&
    !isToolInputValueConfigured({ input: systemInputConfig })
  ) {
    issues.push({ code: 'tool_waiting_config', inputKey: NodeInputKeyEnum.systemInputConfig });
  }

  return issues;
};

/** 校验当前节点输入和专属配置，模型必填错误不再重复产生通用必填错误。 */
export const checkWorkflowNodeInputRules = ({
  data,
  inputMap,
  context,
  variables,
  modelIssues
}: {
  data: FlowNodeItemType;
  inputMap: Map<string, FlowNodeInputItemType>;
  context: WorkflowCheckContext;
  modelIssues: WorkflowRuleIssue[];
  variables?: AppChatConfigType['variables'];
}): WorkflowRuleIssue[] => {
  const isEmptyWorkflowInputValue = (value: unknown) =>
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);

  /** hidden / off 不渲染，非必填 any 不参与通用必填校验，避免系统 hidden 字段误报或与节点特判重复。 */
  const shouldSkipGenericRequiredInputCheck = (input: FlowNodeInputItemType) => {
    const renderType = getSelectedInputRenderType(input);
    if (renderType === FlowNodeInputTypeEnum.hidden || renderType === FlowNodeInputTypeEnum.off) {
      return true;
    }
    if (!input.valueType) return true;
    if (input.valueType === WorkflowIOValueTypeEnum.boolean) return true;
    if (input.valueType === WorkflowIOValueTypeEnum.any) {
      return !input.required;
    }
    return false;
  };

  /** 引用输入是否尚未选择（空占位 / 未选变量），区别于曾经选中但已失效的引用。 */
  const isUnsetReferenceValue = (value: unknown) => {
    if (value === undefined || value === null || value === '') return true;
    if (!Array.isArray(value)) return true;
    if (value.length === 0) return true;

    // 单引用 [nodeId, outputId]；占位符 ['', ''] 或格式不完整均视为未选择
    if (value.length === 2 && !Array.isArray(value[0])) {
      const [refNodeId, refOutputId] = value;
      if (typeof refNodeId !== 'string') return true;
      return !refNodeId || !refOutputId;
    }

    return false;
  };

  const isEmptyReferenceInputValue = (value: unknown, isArrayType: boolean) => {
    if (isArrayType) {
      return !Array.isArray(value) || value.length === 0;
    }
    return isUnsetReferenceValue(value);
  };

  const isVariableUpdateValueEmpty = (item: TUpdateListItem) => {
    if (item.renderType === FlowNodeInputTypeEnum.reference) {
      if (isValidReferenceValueFormat(item.value)) {
        return !referenceValueIsLive(item.value, context);
      }
      return (
        !Array.isArray(item.value) ||
        item.value.length === 0 ||
        item.value.some((v) => !referenceValueIsLive(v, context))
      );
    }

    if (item.arrayMode === 'clear') return false;
    if (item.booleanMode) return false;
    const inputVal = item.value?.[1];
    return inputVal === undefined || inputVal === null || inputVal === '';
  };

  /** 动态选项仅接受仍可选择的字符串、数组或 any 引用；运行前同时检查全局变量类型。 */
  const dynamicOptionValueTypes = new Set<WorkflowIOValueTypeEnum>([
    WorkflowIOValueTypeEnum.string,
    WorkflowIOValueTypeEnum.arrayString,
    WorkflowIOValueTypeEnum.arrayAny,
    WorkflowIOValueTypeEnum.any
  ]);

  const dynamicOptionReferenceIsLive = (
    value: unknown,
    context: WorkflowCheckContext,
    variables?: AppChatConfigType['variables']
  ) => {
    if (!isValidReferenceValueFormat(value)) return false;

    const [refNodeId, refOutputId] = value;
    if (!refNodeId || !refOutputId) return false;
    if (refNodeId === VARIABLE_NODE_ID) {
      // variables 未提供时保持单节点增量校验的兼容性；运行/发布前会传入完整变量配置。
      if (!variables) return true;

      const variable = variables.find((item) => item.key === refOutputId);
      return (
        !!variable &&
        (variable.valueType === undefined || dynamicOptionValueTypes.has(variable.valueType))
      );
    }

    const sourceNode = context.nodeMap.get(refNodeId);
    if (!sourceNode) return false;

    return filterSelectableWorkflowNodeOutputs({
      outputs: sourceNode.outputs,
      valueType: WorkflowIOValueTypeEnum.any,
      catchError: sourceNode.catchError
    }).some(
      (output) =>
        output.id === refOutputId &&
        (output.valueType === undefined || dynamicOptionValueTypes.has(output.valueType))
    );
  };

  const issues: WorkflowRuleIssue[] = [];
  if (workflowCheckSkipNodeRuleTypes.has(data.flowNodeType)) {
    return issues;
  }

  const inputs = data.inputs;
  const isToolNode = context.incomingEdgesMap
    .get(data.nodeId)
    ?.some((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools);

  // 1. 校验节点类型专属规则。
  if (data.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    const ifElseList = inputMap.get(NodeInputKeyEnum.ifElseList)?.value as
      | IfElseListItemType[]
      | undefined;
    const hasIncompleteCondition = (ifElseList ?? []).some((item) =>
      item.list.some(
        (listItem) =>
          listItem.variable === undefined ||
          listItem.condition === undefined ||
          (listItem.value === undefined &&
            listItem.condition !== VariableConditionEnum.isEmpty &&
            listItem.condition !== VariableConditionEnum.isNotEmpty)
      )
    );

    if (!ifElseList || hasIncompleteCondition) {
      issues.push({ code: 'if_else_incomplete', inputKey: NodeInputKeyEnum.ifElseList });
    }
  }

  if (
    data.flowNodeType === FlowNodeTypeEnum.userSelect ||
    data.flowNodeType === FlowNodeTypeEnum.classifyQuestion
  ) {
    const isUserSelect = data.flowNodeType === FlowNodeTypeEnum.userSelect;
    const inputKey = isUserSelect ? NodeInputKeyEnum.userSelectOptions : NodeInputKeyEnum.agents;
    const codePrefix = isUserSelect ? 'user_select' : 'classify_question';
    const optionInput = inputMap.get(inputKey);
    if (
      isUserSelect &&
      optionInput &&
      getSelectedInputRenderType(optionInput) === FlowNodeInputTypeEnum.reference
    ) {
      const references = optionInput.value;
      if (!Array.isArray(references) || references.length === 0) {
        issues.push({ code: 'user_select_empty', inputKey });
      } else if (
        !references.every((reference) =>
          dynamicOptionReferenceIsLive(reference, context, variables)
        )
      ) {
        issues.push({ code: 'invalid_reference', inputKey, input: optionInput });
      }
    } else {
      const options = optionInput?.value as Array<{ value?: string }> | undefined;
      if (!options?.length) {
        issues.push({ code: `${codePrefix}_empty`, inputKey });
      } else if (options.some((option) => !option.value)) {
        issues.push({ code: `${codePrefix}_value_empty`, inputKey });
      }
    }
  }

  if (data.flowNodeType === FlowNodeTypeEnum.formInput) {
    const value = inputMap.get(NodeInputKeyEnum.userInputForms)?.value as
      | Array<{
          key?: string;
          label?: string;
          listInputType?: FlowNodeInputTypeEnum;
          listReference?: unknown;
        }>
      | undefined;
    if (!value || value.length === 0) {
      issues.push({ code: 'form_input_empty', inputKey: NodeInputKeyEnum.userInputForms });
    } else {
      const invalidReferenceForm = value.find((form) => {
        if (form.listInputType !== FlowNodeInputTypeEnum.reference) return false;
        const references = isValidReferenceValueFormat(form.listReference)
          ? [form.listReference]
          : Array.isArray(form.listReference)
            ? form.listReference
            : [];
        return (
          references.length === 0 ||
          !references.every((reference) =>
            dynamicOptionReferenceIsLive(reference, context, variables)
          )
        );
      });
      if (invalidReferenceForm) {
        issues.push({
          code: 'invalid_reference',
          inputKey: NodeInputKeyEnum.userInputForms,
          fallbackLabel: invalidReferenceForm.label || invalidReferenceForm.key || 'Options'
        });
      }
    }
  }

  if (data.flowNodeType === FlowNodeTypeEnum.datasetConcatNode) {
    const quoteInputs = inputs.filter((input) => input.canEdit);
    if (quoteInputs.length === 0) {
      issues.push({
        code: 'required_input_empty',
        inputKey: NodeInputKeyEnum.datasetQuoteList,
        fieldLabel: 'dataset_quote'
      });
    }
  }

  if (data.flowNodeType === FlowNodeTypeEnum.code) {
    const hasIncompleteDynamicInput = inputs.some((input) => {
      if (
        [NodeInputKeyEnum.code, NodeInputKeyEnum.codeType, NodeInputKeyEnum.addInputParam].includes(
          input.key as NodeInputKeyEnum
        )
      ) {
        return false;
      }
      if (!input.canEdit) {
        return false;
      }
      // 工具参数由 Agent 生成时无需填写引用值；手动模式仍按代码变量校验。
      if (
        isToolNode &&
        isAgentGeneratedToolInput(
          initToolInputTypeByDefaultMode(input, {
            allowUserChatInputAgentGenerated: true
          })
        ) &&
        canInputBeAgentGenerated(input)
      ) {
        return false;
      }
      return !input.key || !input.label || isUnsetReferenceValue(input.value);
    });
    if (hasIncompleteDynamicInput) {
      issues.push({ code: 'code_input_incomplete' });
    }
  }

  if (data.flowNodeType === FlowNodeTypeEnum.httpRequest468) {
    const urlInput = inputMap.get(NodeInputKeyEnum.httpReqUrl);
    if (isEmptyWorkflowInputValue(urlInput?.value)) {
      issues.push({ code: 'http_url_empty', inputKey: NodeInputKeyEnum.httpReqUrl });
    }
  }

  if (data.flowNodeType === FlowNodeTypeEnum.contentExtract) {
    const extractKeys = inputMap.get(NodeInputKeyEnum.extractKeys)?.value as unknown[] | undefined;
    if (!extractKeys || extractKeys.length === 0) {
      issues.push({ code: 'context_extract_empty', inputKey: NodeInputKeyEnum.extractKeys });
    }
  }

  if (data.flowNodeType === FlowNodeTypeEnum.loopRun) {
    const mode = inputMap.get(NodeInputKeyEnum.loopRunMode)?.value as LoopRunModeEnum | undefined;
    if (mode === LoopRunModeEnum.conditional) {
      const children = (inputMap.get(NodeInputKeyEnum.childrenNodeIdList)?.value as string[]) ?? [];
      const childSet = new Set(children);
      const hasBreak = Array.from(context.nodeMap.values()).some(
        (n) => childSet.has(n.nodeId) && n.flowNodeType === FlowNodeTypeEnum.loopRunBreak
      );
      if (!hasBreak) {
        issues.push({ code: 'loop_run_missing_break' });
      }
    }
  }

  if (data.flowNodeType === FlowNodeTypeEnum.toolCall) {
    const toolConnections = context.outgoingEdgesMap
      .get(data.nodeId)
      ?.filter((edge) => edge.sourceHandle === NodeOutputKeyEnum.selectedTools);
    const useAgentSandbox = inputMap.get(NodeInputKeyEnum.useAgentSandbox)?.value;
    if ((toolConnections?.length ?? 0) === 0 && !useAgentSandbox) {
      issues.push({ code: 'tool_call_empty', inputKey: NodeInputKeyEnum.useAgentSandbox });
    }
  }

  if (data.flowNodeType === FlowNodeTypeEnum.variableUpdate) {
    const updateList = inputMap.get(NodeInputKeyEnum.updateList)?.value as
      | TUpdateListItem[]
      | undefined;

    const addVariableUpdateRequiredIssue = (field: 'variable' | 'value') => {
      issues.push({
        code: 'required_input_empty',
        inputKey: NodeInputKeyEnum.updateList,
        fieldLabel: field
      });
    };

    if (!updateList || updateList.length === 0) {
      addVariableUpdateRequiredIssue('variable');
      addVariableUpdateRequiredIssue('value');
    } else {
      updateList.forEach((item) => {
        if (!referenceValueIsLive(item.variable, context)) {
          addVariableUpdateRequiredIssue('variable');
        }
        if (isVariableUpdateValueEmpty(item)) {
          addVariableUpdateRequiredIssue('value');
        }
      });
    }
  }

  // 2. 校验通用必填输入规则。
  inputs.forEach((input) => {
    if (input.key === NodeInputKeyEnum.loopRunInputArray) {
      const loopRunMode = inputMap.get(NodeInputKeyEnum.loopRunMode)?.value as
        | LoopRunModeEnum
        | undefined;
      if (
        data.flowNodeType === FlowNodeTypeEnum.loopRun &&
        loopRunMode === LoopRunModeEnum.conditional
      ) {
        return;
      }
    }

    if (shouldSkipGenericRequiredInputCheck(input)) {
      return;
    }

    // 搜索辅助模型的空值由发布接口补默认，不能再被通用 required 规则重复拦截。
    if (
      isWorkflowSystemModelInput({ node: data, input }) &&
      !nodeInputIsReference(input) &&
      workflowDatasetParamModelSlots.some(
        ({ legacyKey, modelIdKey }) => input.key === modelIdKey || input.key === legacyKey
      )
    ) {
      return;
    }

    // Agent 生成字段运行时由模型填写，不需要开发者预填。
    const normalizedInput =
      isToolNode || input.key === NodeInputKeyEnum.userChatInput
        ? initToolInputTypeByDefaultMode(input, {
            allowUserChatInputAgentGenerated: isToolNode
          })
        : input;
    if (
      isToolNode &&
      isAgentGeneratedToolInput(normalizedInput) &&
      canInputBeAgentGenerated(normalizedInput)
    ) {
      return;
    }

    const isReferenceInput = nodeInputIsReference(input);
    const isArrayReference = isReferenceInput && !!input.valueType?.startsWith('array');
    // 节点未显式配置时，runtime 会回退 defaultValue；运行检查应与实际执行一致。
    const effectiveInputValue = input.value ?? input.defaultValue;
    const inputValueIsEmpty = isReferenceInput
      ? isEmptyReferenceInputValue(effectiveInputValue, isArrayReference)
      : isEmptyWorkflowInputValue(effectiveInputValue);

    if (
      input.required &&
      inputValueIsEmpty &&
      !modelIssues.some(
        (issue) => issue.code === 'model_required' && issue.inputKey === input.key
      ) &&
      !(data.flowNodeType === FlowNodeTypeEnum.code && input.canEdit)
    ) {
      issues.push({ code: 'required_input_empty', inputKey: input.key, input });
    }
  });

  return issues;
};
