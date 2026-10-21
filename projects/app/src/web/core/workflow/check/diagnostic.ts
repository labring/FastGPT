import {
  WorkflowDiagnosticCodeEnum,
  WorkflowCheckIssueCodeEnum
} from '@fastgpt/global/core/workflow/diagnostic/constants';
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

const legacyIssueCodes: Partial<Record<WorkflowDiagnosticCodeEnum, WorkflowCheckIssueCodeEnum>> = {
  [WorkflowDiagnosticCodeEnum.requiredInputMissing]: WorkflowCheckIssueCodeEnum.requiredInputEmpty,
  [WorkflowDiagnosticCodeEnum.extractFieldsRequired]:
    WorkflowCheckIssueCodeEnum.contextExtractEmpty,
  [WorkflowDiagnosticCodeEnum.variableUpdateTargetMissing]:
    WorkflowCheckIssueCodeEnum.requiredInputEmpty,
  [WorkflowDiagnosticCodeEnum.variableUpdateValueMissing]:
    WorkflowCheckIssueCodeEnum.requiredInputEmpty,
  [WorkflowDiagnosticCodeEnum.variableUpdateItemInvalid]:
    WorkflowCheckIssueCodeEnum.variableUpdateIncomplete,
  [WorkflowDiagnosticCodeEnum.conditionalLoopBreakRequired]:
    WorkflowCheckIssueCodeEnum.loopRunMissingBreak,
  [WorkflowDiagnosticCodeEnum.toolRequired]: WorkflowCheckIssueCodeEnum.toolCallEmpty,
  [WorkflowDiagnosticCodeEnum.codeInputIncomplete]: WorkflowCheckIssueCodeEnum.codeInputIncomplete,
  [WorkflowDiagnosticCodeEnum.toolInputConfigurationMissing]:
    WorkflowCheckIssueCodeEnum.toolWaitingConfig,
  [WorkflowDiagnosticCodeEnum.nodeNotReachable]: WorkflowCheckIssueCodeEnum.noUpstream,
  [WorkflowDiagnosticCodeEnum.nodeIsolated]: WorkflowCheckIssueCodeEnum.isolatedNode,
  [WorkflowDiagnosticCodeEnum.referenceFormatInvalid]: WorkflowCheckIssueCodeEnum.invalidReference,
  [WorkflowDiagnosticCodeEnum.referenceOutputNotFound]: WorkflowCheckIssueCodeEnum.invalidReference,
  [WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream]:
    WorkflowCheckIssueCodeEnum.invalidReference,
  [WorkflowDiagnosticCodeEnum.referenceTypeMismatch]: WorkflowCheckIssueCodeEnum.invalidReference,
  [WorkflowDiagnosticCodeEnum.modelRequired]: WorkflowCheckIssueCodeEnum.modelRequired,
  [WorkflowDiagnosticCodeEnum.modelUnavailable]: WorkflowCheckIssueCodeEnum.modelUnavailable
};

// 仅为 Core 额外严格规则增加具体文案；已有 Web 规则继续使用原来的错误码、翻译和字段标签。
const coreMessageKeys: Partial<Record<WorkflowDiagnosticCodeEnum, ParseKeys>> = {
  [WorkflowDiagnosticCodeEnum.schemaInvalid]: i18nT('common:core.workflow.check.schema_invalid'),
  [WorkflowDiagnosticCodeEnum.nodeIdDuplicated]: i18nT(
    'common:core.workflow.check.node_id_duplicated'
  ),
  [WorkflowDiagnosticCodeEnum.inputKeyDuplicated]: i18nT(
    'common:core.workflow.check.input_key_duplicated'
  ),
  [WorkflowDiagnosticCodeEnum.outputKeyDuplicated]: i18nT(
    'common:core.workflow.check.output_key_duplicated'
  ),
  [WorkflowDiagnosticCodeEnum.inputModeInvalid]: i18nT(
    'common:core.workflow.check.input_mode_invalid'
  ),
  [WorkflowDiagnosticCodeEnum.inputValueTypeInvalid]: i18nT(
    'common:core.workflow.check.input_type_invalid'
  ),
  [WorkflowDiagnosticCodeEnum.referenceTypeMismatch]: i18nT(
    'common:core.workflow.check.reference_type_mismatch'
  ),
  [WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid]: i18nT(
    'common:core.workflow.check.input_schema_invalid'
  ),
  [WorkflowDiagnosticCodeEnum.templateParameterSchemaMissing]: i18nT(
    'common:core.workflow.check.input_schema_missing'
  ),
  [WorkflowDiagnosticCodeEnum.startCountInvalid]: i18nT(
    'common:core.workflow.check.start_count_invalid'
  ),
  [WorkflowDiagnosticCodeEnum.parentNodeNotFound]: i18nT(
    'common:core.workflow.check.parent_missing'
  ),
  [WorkflowDiagnosticCodeEnum.parentNotContainer]: i18nT(
    'common:core.workflow.check.parent_not_container'
  ),
  [WorkflowDiagnosticCodeEnum.nodeNotAllowedInContainer]: i18nT(
    'common:core.workflow.check.node_not_allowed_in_container'
  ),
  [WorkflowDiagnosticCodeEnum.interactiveNodeNotAllowedInParallel]: i18nT(
    'common:core.workflow.check.interactive_not_allowed_in_parallel'
  ),
  [WorkflowDiagnosticCodeEnum.loopBreakParentInvalid]: i18nT(
    'common:core.workflow.check.loop_break_parent_invalid'
  ),
  [WorkflowDiagnosticCodeEnum.loopBreakParentRequired]: i18nT(
    'common:core.workflow.check.system_parent_required'
  ),
  [WorkflowDiagnosticCodeEnum.systemOrBreakParentRequired]: i18nT(
    'common:core.workflow.check.system_parent_required'
  ),
  [WorkflowDiagnosticCodeEnum.systemChildMoveForbidden]: i18nT(
    'common:core.workflow.check.system_parent_required'
  ),
  [WorkflowDiagnosticCodeEnum.containerChildrenOutOfSync]: i18nT(
    'common:core.workflow.check.container_children_out_of_sync'
  ),
  [WorkflowDiagnosticCodeEnum.containerSystemChildInvalid]: i18nT(
    'common:core.workflow.check.container_system_child_invalid'
  ),
  [WorkflowDiagnosticCodeEnum.edgeDuplicated]: i18nT('common:core.workflow.check.edge_duplicated'),
  [WorkflowDiagnosticCodeEnum.edgeInvalid]: i18nT('common:core.workflow.check.edge_invalid'),
  [WorkflowDiagnosticCodeEnum.edgeHandleUnsupported]: i18nT(
    'common:core.workflow.check.edge_handle_unsupported'
  ),
  [WorkflowDiagnosticCodeEnum.edgeCrossScope]: i18nT('common:core.workflow.check.edge_cross_scope'),
  [WorkflowDiagnosticCodeEnum.edgeSelfConnection]: i18nT(
    'common:core.workflow.check.edge_self_connection'
  ),
  [WorkflowDiagnosticCodeEnum.toolEdgeInvalid]: i18nT(
    'common:core.workflow.check.tool_edge_invalid'
  ),
  [WorkflowDiagnosticCodeEnum.toolEdgeNodeInvalid]: i18nT(
    'common:core.workflow.check.tool_edge_invalid'
  ),
  [WorkflowDiagnosticCodeEnum.edgeTargetKindInvalid]: i18nT(
    'common:core.workflow.check.tool_edge_invalid'
  ),
  [WorkflowDiagnosticCodeEnum.catchNotEnabled]: i18nT(
    'common:core.workflow.check.catch_not_enabled'
  ),
  [WorkflowDiagnosticCodeEnum.nextPortUnsupported]: i18nT(
    'common:core.workflow.check.next_port_unsupported'
  ),
  [WorkflowDiagnosticCodeEnum.targetPortUnsupported]: i18nT(
    'common:core.workflow.check.target_port_unsupported'
  ),
  [WorkflowDiagnosticCodeEnum.branchPortUnsupported]: i18nT(
    'common:core.workflow.check.branch_port_unsupported'
  ),
  [WorkflowDiagnosticCodeEnum.branchKeyNotFound]: i18nT(
    'common:core.workflow.check.branch_key_missing'
  ),
  [WorkflowDiagnosticCodeEnum.sourceOutputNotFound]: i18nT(
    'common:core.workflow.check.source_output_missing'
  ),
  [WorkflowDiagnosticCodeEnum.nodeNotFound]: i18nT('common:core.workflow.check.node_missing')
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

  if (diagnostic.code === WorkflowDiagnosticCodeEnum.requiredInputMissing) {
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
      issue.code = WorkflowCheckIssueCodeEnum.httpUrlEmpty;
    } else if (
      node?.flowNodeType === FlowNodeTypeEnum.datasetConcatNode &&
      diagnostic.inputKey === NodeInputKeyEnum.datasetQuoteList
    ) {
      issue.fieldLabel = 'dataset_quote';
    }
  }
  if (
    diagnostic.code === WorkflowDiagnosticCodeEnum.variableUpdateTargetMissing ||
    diagnostic.code === WorkflowDiagnosticCodeEnum.variableUpdateValueMissing
  ) {
    issue.fieldLabel =
      diagnostic.code === WorkflowDiagnosticCodeEnum.variableUpdateTargetMissing
        ? 'variable'
        : 'value';
  }
  if (diagnostic.code === WorkflowDiagnosticCodeEnum.codeInputIncomplete)
    issue.inputKey = undefined;
  if (diagnostic.code === WorkflowDiagnosticCodeEnum.toolRequired)
    issue.inputKey = NodeInputKeyEnum.useAgentSandbox;
  if (
    diagnostic.code === WorkflowDiagnosticCodeEnum.nodeNotReachable &&
    params.reason === WorkflowCheckIssueCodeEnum.unreachableFromStart
  )
    issue.code = WorkflowCheckIssueCodeEnum.unreachableFromStart;
  if (diagnostic.code === WorkflowDiagnosticCodeEnum.branchConfigurationInvalid) {
    if (node?.flowNodeType === FlowNodeTypeEnum.ifElseNode)
      issue.code = WorkflowCheckIssueCodeEnum.ifElseIncomplete;
    else {
      const isEmpty = params.reason === 'empty';
      issue.code =
        node?.flowNodeType === FlowNodeTypeEnum.userSelect
          ? isEmpty
            ? WorkflowCheckIssueCodeEnum.userSelectEmpty
            : WorkflowCheckIssueCodeEnum.userSelectValueEmpty
          : isEmpty
            ? WorkflowCheckIssueCodeEnum.classifyQuestionEmpty
            : WorkflowCheckIssueCodeEnum.classifyQuestionValueEmpty;
      if (params.reason === 'invalid_keys') {
        const key = i18nT('common:core.workflow.check.option_keys_invalid');
        issue.code = diagnostic.code;
        issue.message = t ? t(key) : key;
      }
    }
  }
  if (diagnostic.code === WorkflowDiagnosticCodeEnum.formInputConfigurationInvalid) {
    issue.code = WorkflowCheckIssueCodeEnum.formInputEmpty;
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
    if (diagnostic.code === WorkflowDiagnosticCodeEnum.modelUnavailable)
      issue.messageCode = WorkflowCheckIssueCodeEnum.modelUnavailableShort;
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
    diagnostic.code !== WorkflowDiagnosticCodeEnum.branchConfigurationInvalid &&
    diagnostic.code !== WorkflowDiagnosticCodeEnum.formInputConfigurationInvalid
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
