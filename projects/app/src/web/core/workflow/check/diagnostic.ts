import type { WorkflowDiagnostic } from '@fastgpt/workflow-core/domain/diagnostic';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { workflowSystemModelSlots } from '@fastgpt/global/core/workflow/model/constants';
import type { FlowNodeItemType, WorkflowCheckIssue } from '@fastgpt/global/core/workflow/type/node';
import type { TFunction } from 'next-i18next';
import type { ParseKeys } from '@fastgpt/web/i18n/i18next';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { WorkflowRuleIssue } from '../type';
import { formatWorkflowRuleIssue } from './message';

const legacyIssueCodes: Record<string, string> = {
  WORKFLOW_REQUIRED_INPUT_MISSING: 'required_input_empty',
  WORKFLOW_EXTRACT_FIELDS_REQUIRED: 'context_extract_empty',
  WORKFLOW_VARIABLE_UPDATE_TARGET_MISSING: 'required_input_empty',
  WORKFLOW_VARIABLE_UPDATE_VALUE_MISSING: 'required_input_empty',
  WORKFLOW_VARIABLE_UPDATE_ITEM_INVALID: 'variable_update_incomplete',
  WORKFLOW_CONDITIONAL_LOOP_BREAK_REQUIRED: 'loop_run_missing_break',
  WORKFLOW_TOOL_REQUIRED: 'tool_call_empty',
  WORKFLOW_CODE_INPUT_INCOMPLETE: 'code_input_incomplete',
  WORKFLOW_TOOL_INPUT_CONFIGURATION_MISSING: 'tool_waiting_config',
  WORKFLOW_NODE_NOT_REACHABLE: 'no_upstream',
  WORKFLOW_NODE_ISOLATED: 'isolated_node',
  WORKFLOW_REFERENCE_FORMAT_INVALID: 'invalid_reference',
  WORKFLOW_REFERENCE_OUTPUT_NOT_FOUND: 'invalid_reference',
  WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM: 'invalid_reference',
  WORKFLOW_REFERENCE_TYPE_MISMATCH: 'invalid_reference',
  WORKFLOW_MODEL_REQUIRED: 'model_required',
  WORKFLOW_MODEL_UNAVAILABLE: 'model_unavailable'
};

// 仅为 Core 额外严格规则增加具体文案；已有 Web 规则继续使用原来的错误码、翻译和字段标签。
const coreMessageKeys: Record<string, ParseKeys> = {
  WORKFLOW_SCHEMA_INVALID: i18nT('common:core.workflow.check.schema_invalid'),
  WORKFLOW_NODE_ID_DUPLICATED: i18nT('common:core.workflow.check.node_id_duplicated'),
  WORKFLOW_INPUT_KEY_DUPLICATED: i18nT('common:core.workflow.check.input_key_duplicated'),
  WORKFLOW_OUTPUT_KEY_DUPLICATED: i18nT('common:core.workflow.check.output_key_duplicated'),
  WORKFLOW_INPUT_MODE_INVALID: i18nT('common:core.workflow.check.input_mode_invalid'),
  WORKFLOW_INPUT_VALUE_TYPE_INVALID: i18nT('common:core.workflow.check.input_type_invalid'),
  WORKFLOW_REFERENCE_TYPE_MISMATCH: i18nT('common:core.workflow.check.reference_type_mismatch'),
  WORKFLOW_INPUT_VALUE_SCHEMA_INVALID: i18nT('common:core.workflow.check.input_schema_invalid'),
  WORKFLOW_TEMPLATE_PARAMETER_SCHEMA_MISSING: i18nT(
    'common:core.workflow.check.input_schema_missing'
  ),
  WORKFLOW_START_COUNT_INVALID: i18nT('common:core.workflow.check.start_count_invalid'),
  WORKFLOW_PARENT_NODE_NOT_FOUND: i18nT('common:core.workflow.check.parent_missing'),
  WORKFLOW_PARENT_NOT_CONTAINER: i18nT('common:core.workflow.check.parent_not_container'),
  WORKFLOW_NODE_NOT_ALLOWED_IN_CONTAINER: i18nT(
    'common:core.workflow.check.node_not_allowed_in_container'
  ),
  WORKFLOW_INTERACTIVE_NODE_NOT_ALLOWED_IN_PARALLEL: i18nT(
    'common:core.workflow.check.interactive_not_allowed_in_parallel'
  ),
  WORKFLOW_LOOP_BREAK_PARENT_INVALID: i18nT('common:core.workflow.check.loop_break_parent_invalid'),
  WORKFLOW_LOOP_BREAK_PARENT_REQUIRED: i18nT('common:core.workflow.check.system_parent_required'),
  WORKFLOW_SYSTEM_OR_BREAK_PARENT_REQUIRED: i18nT(
    'common:core.workflow.check.system_parent_required'
  ),
  WORKFLOW_SYSTEM_CHILD_MOVE_FORBIDDEN: i18nT('common:core.workflow.check.system_parent_required'),
  WORKFLOW_CONTAINER_CHILDREN_OUT_OF_SYNC: i18nT(
    'common:core.workflow.check.container_children_out_of_sync'
  ),
  WORKFLOW_CONTAINER_SYSTEM_CHILD_INVALID: i18nT(
    'common:core.workflow.check.container_system_child_invalid'
  ),
  WORKFLOW_EDGE_DUPLICATED: i18nT('common:core.workflow.check.edge_duplicated'),
  WORKFLOW_EDGE_INVALID: i18nT('common:core.workflow.check.edge_invalid'),
  WORKFLOW_EDGE_HANDLE_UNSUPPORTED: i18nT('common:core.workflow.check.edge_handle_unsupported'),
  WORKFLOW_EDGE_CROSS_SCOPE: i18nT('common:core.workflow.check.edge_cross_scope'),
  WORKFLOW_EDGE_SELF_CONNECTION: i18nT('common:core.workflow.check.edge_self_connection'),
  WORKFLOW_TOOL_EDGE_INVALID: i18nT('common:core.workflow.check.tool_edge_invalid'),
  WORKFLOW_TOOL_EDGE_NODE_INVALID: i18nT('common:core.workflow.check.tool_edge_invalid'),
  WORKFLOW_EDGE_TARGET_KIND_INVALID: i18nT('common:core.workflow.check.tool_edge_invalid'),
  WORKFLOW_CATCH_NOT_ENABLED: i18nT('common:core.workflow.check.catch_not_enabled'),
  WORKFLOW_NEXT_PORT_UNSUPPORTED: i18nT('common:core.workflow.check.next_port_unsupported'),
  WORKFLOW_BRANCH_PORT_UNSUPPORTED: i18nT('common:core.workflow.check.branch_port_unsupported'),
  WORKFLOW_BRANCH_KEY_NOT_FOUND: i18nT('common:core.workflow.check.branch_key_missing'),
  WORKFLOW_SOURCE_OUTPUT_NOT_FOUND: i18nT('common:core.workflow.check.source_output_missing'),
  WORKFLOW_NODE_NOT_FOUND: i18nT('common:core.workflow.check.node_missing')
};

/** 将 Core 的原始诊断转为具体 UI 错误，保留旧 Web 文案与 severity；未知诊断也完整展示原因和参数。 */
export const formatWorkflowDiagnostic = ({
  diagnostic,
  node,
  t
}: {
  diagnostic: WorkflowDiagnostic;
  node?: FlowNodeItemType;
  t?: TFunction;
}): WorkflowCheckIssue => {
  const params = diagnostic.params ?? {};
  const pathInputIndex = diagnostic.path?.[2] === 'inputs' ? diagnostic.path[3] : undefined;
  const input =
    typeof pathInputIndex === 'number'
      ? node?.inputs[pathInputIndex]
      : node?.inputs.find((item) => item.key === diagnostic.inputKey);
  const slot = workflowSystemModelSlots.find((item) => item.modelIdKey === params.slotKey);
  const issue: WorkflowRuleIssue = {
    code: legacyIssueCodes[diagnostic.code] ?? diagnostic.code,
    inputKey: diagnostic.inputKey,
    input,
    level: diagnostic.severity,
    fallbackLabel: slot?.label,
    model: typeof params.model === 'string' ? params.model : undefined
  };

  if (diagnostic.code === 'WORKFLOW_REQUIRED_INPUT_MISSING') {
    if (
      diagnostic.inputKey === NodeInputKeyEnum.userInputForms &&
      typeof params.fieldLabel === 'string'
    ) {
      // 表单内的动态选项错误应显示具体字段，不能被外层“表单配置”标签覆盖。
      issue.input = undefined;
      issue.fallbackLabel = params.fieldLabel;
    }
    if (
      node?.flowNodeType === FlowNodeTypeEnum.httpRequest468 &&
      diagnostic.inputKey === NodeInputKeyEnum.httpReqUrl
    ) {
      issue.code = 'http_url_empty';
    } else if (
      node?.flowNodeType === FlowNodeTypeEnum.datasetConcatNode &&
      diagnostic.inputKey === NodeInputKeyEnum.datasetQuoteList
    ) {
      issue.fieldLabel = 'dataset_quote';
    }
  }
  if (
    diagnostic.code === 'WORKFLOW_VARIABLE_UPDATE_TARGET_MISSING' ||
    diagnostic.code === 'WORKFLOW_VARIABLE_UPDATE_VALUE_MISSING'
  ) {
    issue.fieldLabel =
      diagnostic.code === 'WORKFLOW_VARIABLE_UPDATE_TARGET_MISSING' ? 'variable' : 'value';
  }
  if (diagnostic.code === 'WORKFLOW_CODE_INPUT_INCOMPLETE') issue.inputKey = undefined;
  if (diagnostic.code === 'WORKFLOW_TOOL_REQUIRED')
    issue.inputKey = NodeInputKeyEnum.useAgentSandbox;
  if (
    diagnostic.code === 'WORKFLOW_NODE_NOT_REACHABLE' &&
    params.reason === 'unreachable_from_start'
  )
    issue.code = 'unreachable_from_start';
  if (diagnostic.code === 'WORKFLOW_BRANCH_CONFIGURATION_INVALID') {
    if (node?.flowNodeType === FlowNodeTypeEnum.ifElseNode) issue.code = 'if_else_incomplete';
    else {
      const prefix =
        node?.flowNodeType === FlowNodeTypeEnum.userSelect ? 'user_select' : 'classify_question';
      issue.code = `${prefix}_${params.reason === 'empty' ? 'empty' : 'value_empty'}`;
      if (params.reason === 'invalid_keys') {
        const key = i18nT('common:core.workflow.check.option_keys_invalid');
        issue.code = diagnostic.code;
        issue.message = t ? t(key) : key;
      }
    }
  }
  if (diagnostic.code === 'WORKFLOW_FORM_INPUT_CONFIGURATION_INVALID') {
    issue.code = 'form_input_empty';
    if (params.reason !== 'empty') {
      const key = i18nT('common:core.workflow.check.form_configuration_invalid');
      issue.code = diagnostic.code;
      issue.message = t
        ? t(key, { fieldKeys: Array.isArray(params.fieldKeys) ? params.fieldKeys.join(', ') : '' })
        : key;
    }
  }
  if (diagnostic.path?.[0] === 'chatConfig') {
    issue.fieldLabel = diagnostic.path[1] === 'questionGuide' ? 'question_guide' : 'tts';
    if (diagnostic.code === 'WORKFLOW_MODEL_UNAVAILABLE')
      issue.messageCode = 'model_unavailable_short';
  }
  // Agent 的 datasetParams 本身不是模型选择器，使用具体槽位的标签。
  if (diagnostic.inputKey === NodeInputKeyEnum.datasetParams && slot) issue.input = undefined;

  const messageKey = coreMessageKeys[diagnostic.code];
  if (messageKey) {
    const edge = params.edge as
      | {
          source?: string | { nodeId?: string };
          target?: string | { nodeId?: string };
          sourceHandle?: string;
          targetHandle?: string;
        }
      | undefined;
    const values = {
      ...params,
      nodeId: diagnostic.nodeId ?? node?.nodeId,
      inputName: (() => {
        const label = input?.label || input?.debugLabel || diagnostic.inputKey;
        return label && t ? t(label as ParseKeys) : label;
      })(),
      outputKey: params.outputKey,
      source: typeof edge?.source === 'string' ? edge.source : edge?.source?.nodeId,
      target: typeof edge?.target === 'string' ? edge.target : edge?.target?.nodeId,
      sourceHandle: edge?.sourceHandle,
      targetHandle: edge?.targetHandle,
      path: diagnostic.path?.join('.')
    };
    issue.message = t ? t(messageKey, values) : messageKey;
  } else if (
    !legacyIssueCodes[diagnostic.code] &&
    diagnostic.code !== 'WORKFLOW_BRANCH_CONFIGURATION_INVALID' &&
    diagnostic.code !== 'WORKFLOW_FORM_INPUT_CONFIGURATION_INVALID'
  ) {
    // 保留未映射的新错误内容，不能把阻断错误转成空提示或笼统的“检查失败”。
    issue.message =
      typeof params.reason === 'string'
        ? params.reason
        : `${diagnostic.code}${Object.keys(params).length ? `: ${JSON.stringify(params)}` : ''}`;
  }
  const result = formatWorkflowRuleIssue({ issue, node, t });
  return !node && diagnostic.path?.[0] !== 'chatConfig'
    ? { ...result, nodeId: '__workflow__' }
    : result;
};
