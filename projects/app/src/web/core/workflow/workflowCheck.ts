import type {
  WorkflowCheckIssue,
  WorkflowCheckNodeIssueMap
} from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { Edge, Node } from 'reactflow';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  getHandleId,
  isValidReferenceValue,
  isValidReferenceValueFormat,
  nodeInputIsReference
} from '@fastgpt/global/core/workflow/utils';
import type { TFunction } from 'next-i18next';
import type {
  FlowNodeInputItemType,
  ReferenceItemValueType
} from '@fastgpt/global/core/workflow/type/io';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import type { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import {
  canInputBeAgentGenerated,
  getToolConfigStatus,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput
} from '@fastgpt/global/core/app/formEdit/utils';

type WorkflowCheckContext = {
  nodeMap: Map<string, Node<FlowNodeItemType, string | undefined>>;
  nodeOutputMap: Map<string, Set<string>>;
  incomingEdgesMap: Map<string, Edge<any>[]>;
  outgoingEdgesMap: Map<string, Edge<any>[]>;
  reachableNodeSet: Set<string>;
};

const workflowCheckSkipConnectionTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.systemConfig,
  FlowNodeTypeEnum.pluginConfig,
  FlowNodeTypeEnum.comment,
  FlowNodeTypeEnum.globalVariable,
  FlowNodeTypeEnum.emptyNode
]);

/**
 * 多分支节点的 sourceHandle 必须与当前 options/agents 中的 key 一致；
 * 删除分支后残留的悬空 edge 不应计入有效连线。
 */
const isWorkflowEdgeSourceHandleValid = (
  sourceNode: Node<FlowNodeItemType, string | undefined> | undefined,
  sourceHandle: string | null | undefined
) => {
  if (!sourceNode) return false;

  const { nodeId, flowNodeType, inputs } = sourceNode.data;

  if (flowNodeType === FlowNodeTypeEnum.userSelect) {
    if (!sourceHandle) return false;

    const options = inputs?.find((input) => input.key === NodeInputKeyEnum.userSelectOptions)
      ?.value as Array<{ key?: string }> | undefined;

    return (
      Array.isArray(options) &&
      options.some(
        (option) => option.key && sourceHandle === getHandleId(nodeId, 'source', option.key)
      )
    );
  }

  if (flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
    if (!sourceHandle) return false;

    const agents = inputs?.find((input) => input.key === NodeInputKeyEnum.agents)?.value as
      | Array<{ key?: string }>
      | undefined;

    return (
      Array.isArray(agents) &&
      agents.some((agent) => agent.key && sourceHandle === getHandleId(nodeId, 'source', agent.key))
    );
  }

  return true;
};

const workflowCheckStartTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.nestedStart,
  FlowNodeTypeEnum.loopRunStart
]);

const workflowCheckSkipNodeRuleTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.systemConfig,
  FlowNodeTypeEnum.pluginConfig,
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.comment
]);

const isEmptyWorkflowInputValue = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

/** hidden / 非必填 any 不参与通用必填校验，避免系统 hidden 字段误报或与节点特判重复。 */
const shouldSkipGenericRequiredInputCheck = (input: FlowNodeInputItemType) => {
  const renderType = input.renderTypeList?.[input.selectedTypeIndex ?? 0];
  if (renderType === FlowNodeInputTypeEnum.hidden) return true;
  if (!input.valueType) return true;
  if (input.valueType === WorkflowIOValueTypeEnum.boolean) return true;
  if (input.valueType === WorkflowIOValueTypeEnum.any) {
    return !input.required;
  }
  return false;
};

/** 优先取 label，空则取 debugLabel，并走 i18n 翻译，避免展示 quoteQA 等内部 key。 */
const getInputLabel = (input: FlowNodeInputItemType, t?: TFunction) => {
  const rawLabel =
    (typeof input.label === 'string' && input.label ? input.label : undefined) ||
    (typeof input.debugLabel === 'string' && input.debugLabel ? input.debugLabel : undefined) ||
    input.key;

  if (t && rawLabel) {
    return t(rawLabel as any);
  }

  return rawLabel;
};

/** 设计稿固定提示文案 code，与 issue.code 一一对应或作为文案模板。 */
type WorkflowCheckMessageCode =
  | 'required_input_empty'
  | 'no_upstream'
  | 'invalid_reference'
  | 'if_else_incomplete'
  | 'user_select_empty'
  | 'user_select_value_empty'
  | 'form_input_empty'
  | 'classify_question_empty'
  | 'classify_question_value_empty'
  | 'code_input_incomplete'
  | 'http_url_empty'
  | 'context_extract_empty'
  | 'tool_call_empty'
  | 'tool_inactive'
  | 'tool_missing'
  | 'tool_load_failed'
  | 'tool_no_permission'
  | 'tool_offline';

/** issue.code -> 设计稿固定文案 code。表外 code 映射到最接近的已有文案。 */
const WORKFLOW_CHECK_ISSUE_MESSAGE_CODE_MAP: Record<string, WorkflowCheckMessageCode> = {
  required_input_empty: 'required_input_empty',
  no_upstream: 'no_upstream',
  isolated_node: 'no_upstream',
  unreachable_from_start: 'no_upstream',
  invalid_reference: 'invalid_reference',
  if_else_incomplete: 'if_else_incomplete',
  user_select_empty: 'user_select_empty',
  user_select_value_empty: 'user_select_value_empty',
  form_input_empty: 'form_input_empty',
  classify_question_empty: 'classify_question_empty',
  classify_question_value_empty: 'classify_question_value_empty',
  code_input_incomplete: 'code_input_incomplete',
  http_url_empty: 'http_url_empty',
  context_extract_empty: 'context_extract_empty',
  tool_call_empty: 'tool_call_empty',
  tool_inactive: 'tool_inactive',
  tool_waiting_config: 'tool_inactive',
  tool_missing: 'tool_missing',
  tool_load_failed: 'tool_load_failed',
  tool_no_permission: 'tool_no_permission',
  tool_offline: 'tool_offline',
  loop_run_missing_break: 'if_else_incomplete',
  variable_update_incomplete: 'code_input_incomplete'
};

/** 待处理：引用无效、工具不可访问或加载失败。其余均为待完善。 */
export const WORKFLOW_CHECK_PENDING_HANDLE_CODES = new Set<string>([
  'invalid_reference',
  'tool_missing',
  'tool_load_failed',
  'tool_no_permission',
  'tool_offline'
]);

export type WorkflowCheckUIStatus = 'pending_improve' | 'pending_handle';

/** 按 issue code 映射 UI 状态前缀，不直接使用 level 字段。 */
export const getWorkflowCheckIssueUIStatus = (code: string): WorkflowCheckUIStatus =>
  WORKFLOW_CHECK_PENDING_HANDLE_CODES.has(code) ? 'pending_handle' : 'pending_improve';

const workflowCheckMessageFallback: Record<
  WorkflowCheckMessageCode,
  (params?: { inputName?: string }) => string
> = {
  required_input_empty: ({ inputName } = {}) => `需填写必填项 ${inputName ?? ''}`.trim(),
  no_upstream: () => '未与其他节点连线',
  invalid_reference: ({ inputName } = {}) => `${inputName ?? ''} 引用了无效变量，需删除`.trim(),
  if_else_incomplete: () => '存在未完成的条件配置，请完善',
  user_select_empty: () => '需配置至少一个选项',
  user_select_value_empty: () => '选项不可为空',
  form_input_empty: () => '需配置至少一个字段',
  classify_question_empty: () => '需配置至少一个分类',
  classify_question_value_empty: () => '分类值不可为空',
  code_input_incomplete: () => '存在未完成的输入变量配置，请完善',
  http_url_empty: () => '需配置请求地址',
  context_extract_empty: () => '需配置至少一个目标字段',
  tool_call_empty: () => '需配置工具或开启虚拟机',
  tool_inactive: () => '该工具尚未激活，请激活使用',
  tool_missing: () => '该工具不存在，请删除',
  tool_load_failed: () => '工具加载失败，请稍后重试',
  tool_no_permission: () => '当前账号无权限访问该资源',
  tool_offline: () => '该工具已停用，请删除'
};

const PLUGIN_DATA_PERMISSION_ERROR_CODES = new Set<string>([
  AppErrEnum.unAuthApp,
  PluginErrEnum.unAuth
]);

const PLUGIN_DATA_MISSING_ERROR_CODES = new Set<string>([
  AppErrEnum.unExist,
  PluginErrEnum.unExist
]);

/** pluginData.error 可能是 statusText 或 getErrText 翻译后的 message，需两种都识别。 */
const resolvePluginDataErrorIssueCode = (error: string): WorkflowCheckMessageCode => {
  if (
    PLUGIN_DATA_PERMISSION_ERROR_CODES.has(error) ||
    error === ERROR_RESPONSE[AppErrEnum.unAuthApp]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unAuth]?.message
  ) {
    return 'tool_no_permission';
  }

  if (
    PLUGIN_DATA_MISSING_ERROR_CODES.has(error) ||
    error === ERROR_RESPONSE[AppErrEnum.unExist]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unExist]?.message
  ) {
    return 'tool_missing';
  }

  return 'tool_load_failed';
};

const resolveWorkflowCheckMessageCode = (issueCode: string): WorkflowCheckMessageCode | undefined =>
  WORKFLOW_CHECK_ISSUE_MESSAGE_CODE_MAP[issueCode];

/**
 * 使用显式分支保留所有翻译 key 的静态字面量引用，避免 i18n 清理脚本误删动态 key。
 */
const translateWorkflowCheckIssueMessage = (
  messageCode: WorkflowCheckMessageCode,
  t: TFunction,
  params?: { inputName?: string }
) => {
  switch (messageCode) {
    case 'required_input_empty':
      return t('common:core.workflow.check.required_input_empty', params);
    case 'no_upstream':
      return t('common:core.workflow.check.no_upstream', params);
    case 'invalid_reference':
      return t('common:core.workflow.check.invalid_reference', params);
    case 'if_else_incomplete':
      return t('common:core.workflow.check.if_else_incomplete', params);
    case 'user_select_empty':
      return t('common:core.workflow.check.user_select_empty', params);
    case 'user_select_value_empty':
      return t('common:core.workflow.check.user_select_value_empty', params);
    case 'form_input_empty':
      return t('common:core.workflow.check.form_input_empty', params);
    case 'classify_question_empty':
      return t('common:core.workflow.check.classify_question_empty', params);
    case 'classify_question_value_empty':
      return t('common:core.workflow.check.classify_question_value_empty', params);
    case 'code_input_incomplete':
      return t('common:core.workflow.check.code_input_incomplete', params);
    case 'http_url_empty':
      return t('common:core.workflow.check.http_url_empty', params);
    case 'context_extract_empty':
      return t('common:core.workflow.check.context_extract_empty', params);
    case 'tool_call_empty':
      return t('common:core.workflow.check.tool_call_empty', params);
    case 'tool_inactive':
      return t('common:core.workflow.check.tool_inactive', params);
    case 'tool_missing':
      return t('common:core.workflow.check.tool_missing', params);
    case 'tool_load_failed':
      return t('common:core.workflow.check.tool_load_failed', params);
    case 'tool_no_permission':
      return t('common:core.workflow.check.tool_no_permission', params);
    case 'tool_offline':
      return t('common:core.workflow.check.tool_offline', params);
  }
};

/** 根据 issue.code 返回设计稿固定提示文案，不自由拼接或生成表外文案。 */
export const getWorkflowCheckIssueMessage = (
  issueCode: string,
  t?: TFunction,
  params?: { inputName?: string }
) => {
  const messageCode = resolveWorkflowCheckMessageCode(issueCode);
  if (!messageCode) return '';

  if (t) {
    return translateWorkflowCheckIssueMessage(messageCode, t, params);
  }
  return workflowCheckMessageFallback[messageCode](params);
};

const createWorkflowCheckContext = ({
  nodes,
  edges
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
}): WorkflowCheckContext => {
  const nodeMap = new Map<string, Node<FlowNodeItemType, string | undefined>>();
  const nodeOutputMap = new Map<string, Set<string>>();
  const incomingEdgesMap = new Map<string, Edge<any>[]>();
  const outgoingEdgesMap = new Map<string, Edge<any>[]>();

  nodes.forEach((node) => {
    nodeMap.set(node.data.nodeId, node);
    nodeOutputMap.set(node.data.nodeId, new Set(node.data.outputs.map((output) => output.id)));
    incomingEdgesMap.set(node.data.nodeId, []);
    outgoingEdgesMap.set(node.data.nodeId, []);
  });

  edges.forEach((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    if (!isWorkflowEdgeSourceHandleValid(sourceNode, edge.sourceHandle)) {
      return;
    }

    outgoingEdgesMap.get(edge.source)?.push(edge);
    incomingEdgesMap.get(edge.target)?.push(edge);
  });

  const reachableNodeSet = new Set<string>();
  const visit = (nodeId: string) => {
    if (reachableNodeSet.has(nodeId)) return;
    reachableNodeSet.add(nodeId);

    outgoingEdgesMap.get(nodeId)?.forEach((edge) => visit(edge.target));
  };

  nodes.forEach((node) => {
    if (
      node.data.flowNodeType === FlowNodeTypeEnum.workflowStart ||
      node.data.flowNodeType === FlowNodeTypeEnum.pluginInput ||
      node.data.flowNodeType === FlowNodeTypeEnum.nestedStart ||
      node.data.flowNodeType === FlowNodeTypeEnum.loopRunStart
    ) {
      visit(node.data.nodeId);
    }
  });

  return {
    nodeMap,
    nodeOutputMap,
    incomingEdgesMap,
    outgoingEdgesMap,
    reachableNodeSet
  };
};

const referenceValueIsLive = (
  value: ReferenceItemValueType | undefined,
  context: WorkflowCheckContext
) => {
  if (!isValidReferenceValueFormat(value)) return false;
  const [refNodeId, refOutputId] = value;
  if (!refNodeId || !refOutputId) return false;
  if (refNodeId === VARIABLE_NODE_ID) return true;

  return context.nodeOutputMap.get(refNodeId)?.has(refOutputId) === true;
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

const isVariableUpdateTargetEmpty = (
  variable: unknown,
  nodeIds: string[],
  context: WorkflowCheckContext
) =>
  !isValidReferenceValue(variable, nodeIds) ||
  !referenceValueIsLive(variable as ReferenceItemValueType, context);

const isVariableUpdateValueEmpty = (item: TUpdateListItem, context: WorkflowCheckContext) => {
  if (item.renderType === FlowNodeInputTypeEnum.reference) {
    if (isValidReferenceValueFormat(item.value)) {
      return !referenceValueIsLive(item.value as ReferenceItemValueType, context);
    }
    return (
      !Array.isArray(item.value) ||
      item.value.length === 0 ||
      (item.value as ReferenceItemValueType[]).some((v) => !referenceValueIsLive(v, context))
    );
  }

  if (item.arrayMode === 'clear') return false;
  if (item.booleanMode) return false;
  const inputVal = item.value?.[1];
  return inputVal === undefined || inputVal === null || inputVal === '';
};

/**
 * 结构化校验工作流节点和连线。
 * 函数只读取入参并返回每个节点的错误列表，调用方负责写入 React state、toast 或定位画布。
 */
export const checkWorkflowNodeIssues = ({
  nodes,
  edges,
  nodeId,
  t
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  nodeId?: string;
  t?: TFunction;
}): WorkflowCheckNodeIssueMap => {
  const context = createWorkflowCheckContext({ nodes, edges });
  const issueMap: WorkflowCheckNodeIssueMap = {};
  const nodeIds = nodes.map((node) => node.data.nodeId);
  const targetNodes = nodeId ? nodes.filter((node) => node.data.nodeId === nodeId) : nodes;

  const addIssue = ({
    node,
    code,
    message,
    inputKey
  }: {
    node: Node<FlowNodeItemType, string | undefined>;
    code: string;
    message: string;
    inputKey?: string;
  }) => {
    const issue: WorkflowCheckIssue = {
      nodeId: node.data.nodeId,
      nodeName: node.data.name,
      nodeType: node.data.flowNodeType,
      level: 'error',
      code,
      message,
      inputKey
    };
    issueMap[node.data.nodeId] = [...(issueMap[node.data.nodeId] ?? []), issue];
  };

  for (const node of targetNodes) {
    const data = node.data;
    const inputs = data.inputs;
    const inputMap = new Map(inputs.map((input) => [input.key, input]));
    const isToolNode = context.incomingEdgesMap
      .get(data.nodeId)
      ?.some((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools);

    if (data.pluginData?.error) {
      const issueCode = resolvePluginDataErrorIssueCode(data.pluginData.error);
      addIssue({
        node,
        code: issueCode,
        message: getWorkflowCheckIssueMessage(issueCode, t)
      });
    }

    const status = data.status ?? data.pluginData?.status;
    if (status === PluginStatusEnum.Offline) {
      addIssue({
        node,
        code: 'tool_offline',
        message: getWorkflowCheckIssueMessage('tool_offline', t)
      });
    }

    // 工具调用下游工具：与 NodeSecret / getToolConfigStatus 共用「尚未激活」判定。
    if (isToolNode) {
      const configStatus = getToolConfigStatus({ tool: data });
      if (configStatus.status === 'waitingForConfig') {
        addIssue({
          node,
          code: 'tool_waiting_config',
          message: getWorkflowCheckIssueMessage('tool_waiting_config', t),
          inputKey: NodeInputKeyEnum.systemInputConfig
        });
      }
    }

    if (!workflowCheckSkipNodeRuleTypes.has(data.flowNodeType)) {
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
          addIssue({
            node,
            code: 'if_else_incomplete',
            message: getWorkflowCheckIssueMessage('if_else_incomplete', t),
            inputKey: NodeInputKeyEnum.ifElseList
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.userSelect) {
        const configValue = inputMap.get(NodeInputKeyEnum.userSelectOptions)?.value as
          | Array<{ value?: string }>
          | undefined;
        if (!configValue || configValue.length === 0) {
          addIssue({
            node,
            code: 'user_select_empty',
            message: getWorkflowCheckIssueMessage('user_select_empty', t),
            inputKey: NodeInputKeyEnum.userSelectOptions
          });
        } else if (configValue.some((item) => !item.value)) {
          addIssue({
            node,
            code: 'user_select_value_empty',
            message: getWorkflowCheckIssueMessage('user_select_value_empty', t),
            inputKey: NodeInputKeyEnum.userSelectOptions
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.formInput) {
        const value = inputMap.get(NodeInputKeyEnum.userInputForms)?.value as unknown[] | undefined;
        if (!value || value.length === 0) {
          addIssue({
            node,
            code: 'form_input_empty',
            message: getWorkflowCheckIssueMessage('form_input_empty', t),
            inputKey: NodeInputKeyEnum.userInputForms
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.datasetConcatNode) {
        const quoteInputs = inputs.filter((input) => input.canEdit);
        if (quoteInputs.length === 0) {
          addIssue({
            node,
            code: 'required_input_empty',
            message: getWorkflowCheckIssueMessage('required_input_empty', t, {
              inputName: t ? t('common:core.workflow.Dataset quote' as any) : '知识库引用'
            }),
            inputKey: NodeInputKeyEnum.datasetQuoteList
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
        const agents = inputMap.get(NodeInputKeyEnum.agents)?.value as
          | Array<{ value?: string; key?: string }>
          | undefined;
        if (!agents || agents.length === 0) {
          addIssue({
            node,
            code: 'classify_question_empty',
            message: getWorkflowCheckIssueMessage('classify_question_empty', t),
            inputKey: NodeInputKeyEnum.agents
          });
        } else if (agents.some((item) => !item.value)) {
          addIssue({
            node,
            code: 'classify_question_value_empty',
            message: getWorkflowCheckIssueMessage('classify_question_value_empty', t),
            inputKey: NodeInputKeyEnum.agents
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.code) {
        const hasIncompleteDynamicInput = inputs.some((input) => {
          if (
            [
              NodeInputKeyEnum.code,
              NodeInputKeyEnum.codeType,
              NodeInputKeyEnum.addInputParam
            ].includes(input.key as NodeInputKeyEnum)
          ) {
            return false;
          }
          if (!input.canEdit) {
            return false;
          }
          return !input.key || !input.label || isUnsetReferenceValue(input.value);
        });
        if (hasIncompleteDynamicInput) {
          addIssue({
            node,
            code: 'code_input_incomplete',
            message: getWorkflowCheckIssueMessage('code_input_incomplete', t)
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.httpRequest468) {
        const urlInput = inputMap.get(NodeInputKeyEnum.httpReqUrl);
        if (isEmptyWorkflowInputValue(urlInput?.value)) {
          addIssue({
            node,
            code: 'http_url_empty',
            message: getWorkflowCheckIssueMessage('http_url_empty', t),
            inputKey: NodeInputKeyEnum.httpReqUrl
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.contentExtract) {
        const extractKeys = inputMap.get(NodeInputKeyEnum.extractKeys)?.value as
          | unknown[]
          | undefined;
        if (!extractKeys || extractKeys.length === 0) {
          addIssue({
            node,
            code: 'context_extract_empty',
            message: getWorkflowCheckIssueMessage('context_extract_empty', t),
            inputKey: NodeInputKeyEnum.extractKeys
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.loopRun) {
        const mode = inputMap.get(NodeInputKeyEnum.loopRunMode)?.value as
          | LoopRunModeEnum
          | undefined;
        if (mode === LoopRunModeEnum.conditional) {
          const children =
            (inputMap.get(NodeInputKeyEnum.childrenNodeIdList)?.value as string[]) ?? [];
          const childSet = new Set(children);
          const hasBreak = nodes.some(
            (n) =>
              childSet.has(n.data.nodeId) && n.data.flowNodeType === FlowNodeTypeEnum.loopRunBreak
          );
          if (!hasBreak) {
            addIssue({
              node,
              code: 'loop_run_missing_break',
              message: getWorkflowCheckIssueMessage('loop_run_missing_break', t)
            });
          }
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.toolCall) {
        const toolConnections = context.outgoingEdgesMap
          .get(data.nodeId)
          ?.filter((edge) => edge.sourceHandle === NodeOutputKeyEnum.selectedTools);
        const useAgentSandbox = inputMap.get(NodeInputKeyEnum.useAgentSandbox)?.value;
        if ((toolConnections?.length ?? 0) === 0 && !useAgentSandbox) {
          addIssue({
            node,
            code: 'tool_call_empty',
            message: getWorkflowCheckIssueMessage('tool_call_empty', t),
            inputKey: NodeInputKeyEnum.useAgentSandbox
          });
        }
      }

      if (data.flowNodeType === FlowNodeTypeEnum.variableUpdate) {
        const updateList = inputMap.get(NodeInputKeyEnum.updateList)?.value as
          | TUpdateListItem[]
          | undefined;

        const addVariableUpdateRequiredIssue = (field: 'variable' | 'value') => {
          const inputName = (() => {
            if (field === 'variable') {
              return t ? t('common:core.workflow.variable' as any) : '变量';
            }

            return t ? t('common:value' as any) : '值';
          })();

          addIssue({
            node,
            code: 'required_input_empty',
            message: getWorkflowCheckIssueMessage('required_input_empty', t, {
              inputName
            }),
            inputKey: NodeInputKeyEnum.updateList
          });
        };

        if (!updateList || updateList.length === 0) {
          addVariableUpdateRequiredIssue('variable');
          addVariableUpdateRequiredIssue('value');
        } else {
          updateList.forEach((item) => {
            if (isVariableUpdateTargetEmpty(item.variable, nodeIds, context)) {
              addVariableUpdateRequiredIssue('variable');
            }
            if (isVariableUpdateValueEmpty(item, context)) {
              addVariableUpdateRequiredIssue('value');
            }
          });
        }
      }

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

        // Agent 生成字段运行时由模型填写，不需要开发者预填。
        const normalizedInput = initToolInputTypeByDefaultMode(input);
        if (
          isToolNode &&
          isAgentGeneratedToolInput(normalizedInput) &&
          canInputBeAgentGenerated(normalizedInput)
        ) {
          return;
        }

        const isReferenceInput = nodeInputIsReference(input);
        const isArrayReference = isReferenceInput && !!input.valueType?.startsWith('array');
        const inputValueIsEmpty = isReferenceInput
          ? isEmptyReferenceInputValue(input.value, isArrayReference)
          : isEmptyWorkflowInputValue(input.value);

        if (
          input.required &&
          inputValueIsEmpty &&
          !(data.flowNodeType === FlowNodeTypeEnum.code && input.canEdit)
        ) {
          addIssue({
            node,
            code: 'required_input_empty',
            message: getWorkflowCheckIssueMessage('required_input_empty', t, {
              inputName: getInputLabel(input, t)
            }),
            inputKey: input.key
          });
        }
      });
    }

    if (!workflowCheckSkipConnectionTypes.has(data.flowNodeType)) {
      const isStartNode = workflowCheckStartTypes.has(data.flowNodeType);
      const incomingEdges = context.incomingEdgesMap.get(data.nodeId) ?? [];
      const outgoingEdges = context.outgoingEdgesMap.get(data.nodeId) ?? [];
      const meaningfulOutgoingEdges =
        data.flowNodeType === FlowNodeTypeEnum.toolCall
          ? outgoingEdges.filter((edge) => edge.sourceHandle !== NodeOutputKeyEnum.selectedTools)
          : outgoingEdges;
      const hasAnyMeaningfulEdge = incomingEdges.length > 0 || meaningfulOutgoingEdges.length > 0;

      if (!isStartNode && incomingEdges.length === 0) {
        addIssue({
          node,
          code: 'no_upstream',
          message: getWorkflowCheckIssueMessage('no_upstream', t)
        });
      } else if (!isStartNode && !context.reachableNodeSet.has(data.nodeId)) {
        addIssue({
          node,
          code: 'unreachable_from_start',
          message: getWorkflowCheckIssueMessage('unreachable_from_start', t)
        });
      } else if (!hasAnyMeaningfulEdge) {
        addIssue({
          node,
          code: 'isolated_node',
          message: getWorkflowCheckIssueMessage('isolated_node', t)
        });
      }
    }
  }

  return issueMap;
};

export const checkWorkflowHasError = (nodeIssueMap: WorkflowCheckNodeIssueMap) =>
  Object.values(nodeIssueMap).some((issues) => issues.some((issue) => issue.level === 'error'));

/** 返回存在 error 的 nodeId 列表；传入 nodeOrder 时按画布节点顺序排列，便于稳定定位第一个错误节点。 */
export const getWorkflowCheckErrorNodeIds = (
  nodeIssueMap: WorkflowCheckNodeIssueMap,
  nodeOrder?: string[]
) => {
  const errorNodeIdSet = new Set(
    Object.entries(nodeIssueMap)
      .filter(([, issues]) => issues.some((issue) => issue.level === 'error'))
      .map(([nodeId]) => nodeId)
  );

  if (nodeOrder) {
    return nodeOrder.filter((nodeId) => errorNodeIdSet.has(nodeId));
  }

  return [...errorNodeIdSet];
};

/** 运行/发布前全量扫描，并按画布节点顺序返回第一个 error 节点。 */
export const checkWorkflowBeforeRunOrPublish = ({
  nodes,
  edges,
  t
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
  t?: TFunction;
}) => {
  const issueMap = checkWorkflowNodeIssues({ nodes, edges, t });
  const nodeOrder = nodes.map((node) => node.data.nodeId);
  const errorNodeIds = getWorkflowCheckErrorNodeIds(issueMap, nodeOrder);

  return {
    issueMap,
    hasError: errorNodeIds.length > 0,
    firstErrorNodeId: errorNodeIds[0],
    errorNodeIds
  };
};
