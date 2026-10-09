import { z } from 'zod';

/**
 * Workflow Issue 的稳定标识集合。
 *
 * Issue 只携带 code 与插值参数，不携带文案：判定规则在 Runtime，文案解析在渲染层，
 * 因此切换语言只需要重新渲染，不需要重算 Issue View。
 * 新增规则时必须同时补 `WORKFLOW_ISSUE_I18N_KEYS`，穷尽 Record 会让漏项直接编译失败。
 */
export const WorkflowIssueCode = {
  requiredInputEmpty: 'required_input_empty',
  noUpstream: 'no_upstream',
  isolatedNode: 'isolated_node',
  unreachableFromStart: 'unreachable_from_start',
  invalidReference: 'invalid_reference',
  invalidReferenceType: 'invalid_reference_type',
  unreachableReference: 'unreachable_reference',
  ifElseIncomplete: 'if_else_incomplete',
  loopRunMissingBreak: 'loop_run_missing_break',
  userSelectEmpty: 'user_select_empty',
  userSelectValueEmpty: 'user_select_value_empty',
  formInputEmpty: 'form_input_empty',
  classifyQuestionEmpty: 'classify_question_empty',
  classifyQuestionValueEmpty: 'classify_question_value_empty',
  codeInputIncomplete: 'code_input_incomplete',
  httpUrlEmpty: 'http_url_empty',
  contextExtractEmpty: 'context_extract_empty',
  toolCallEmpty: 'tool_call_empty',
  toolWaitingConfig: 'tool_waiting_config',
  toolMissing: 'tool_missing',
  toolLoadFailed: 'tool_load_failed',
  toolNoPermission: 'tool_no_permission',
  toolOffline: 'tool_offline',
  resourceMissing: 'resource_missing',
  resourceNoPermission: 'resource_no_permission',
  modelUnavailable: 'model_unavailable',
  /** 工作流级（chatConfig）模型问题：文案不含节点名，与节点级 model_unavailable 分开。 */
  modelUnavailableShort: 'model_unavailable_short',
  modelRequired: 'model_required',
  sandboxNotConfigured: 'sandbox_not_configured',
  sandboxPlanNotSupported: 'sandbox_plan_not_supported'
} as const;

export const WorkflowIssueCodeSchema = z.enum(WorkflowIssueCode);

export type WorkflowIssueCode = z.infer<typeof WorkflowIssueCodeSchema>;

/**
 * code -> 完整 i18n key（含命名空间）。多个 code 可以共用一条文案，
 * 例如 isolated_node / unreachable_from_start 都展示 no_upstream 的提示。
 */
export const WORKFLOW_ISSUE_I18N_KEYS: Record<WorkflowIssueCode, string> = {
  [WorkflowIssueCode.requiredInputEmpty]: 'common:core.workflow.check.required_input_empty',
  [WorkflowIssueCode.noUpstream]: 'common:core.workflow.check.no_upstream',
  [WorkflowIssueCode.isolatedNode]: 'common:core.workflow.check.no_upstream',
  [WorkflowIssueCode.unreachableFromStart]: 'common:core.workflow.check.no_upstream',
  [WorkflowIssueCode.invalidReference]: 'common:core.workflow.check.invalid_reference',
  [WorkflowIssueCode.invalidReferenceType]: 'common:core.workflow.check.invalid_reference_type',
  [WorkflowIssueCode.unreachableReference]: 'common:core.workflow.check.unreachable_reference',
  [WorkflowIssueCode.ifElseIncomplete]: 'common:core.workflow.check.if_else_incomplete',
  [WorkflowIssueCode.loopRunMissingBreak]: 'common:core.workflow.check.if_else_incomplete',
  [WorkflowIssueCode.userSelectEmpty]: 'common:core.workflow.check.user_select_empty',
  [WorkflowIssueCode.userSelectValueEmpty]: 'common:core.workflow.check.user_select_value_empty',
  [WorkflowIssueCode.formInputEmpty]: 'common:core.workflow.check.form_input_empty',
  [WorkflowIssueCode.classifyQuestionEmpty]: 'common:core.workflow.check.classify_question_empty',
  [WorkflowIssueCode.classifyQuestionValueEmpty]:
    'common:core.workflow.check.classify_question_value_empty',
  [WorkflowIssueCode.codeInputIncomplete]: 'common:core.workflow.check.code_input_incomplete',
  [WorkflowIssueCode.httpUrlEmpty]: 'common:core.workflow.check.http_url_empty',
  [WorkflowIssueCode.contextExtractEmpty]: 'common:core.workflow.check.context_extract_empty',
  [WorkflowIssueCode.toolCallEmpty]: 'common:core.workflow.check.tool_call_empty',
  [WorkflowIssueCode.toolWaitingConfig]: 'common:core.workflow.check.tool_inactive',
  [WorkflowIssueCode.toolMissing]: 'common:core.workflow.check.tool_missing',
  [WorkflowIssueCode.toolLoadFailed]: 'common:core.workflow.check.tool_load_failed',
  [WorkflowIssueCode.toolNoPermission]: 'common:core.workflow.check.tool_no_permission',
  [WorkflowIssueCode.toolOffline]: 'common:core.workflow.check.tool_missing',
  [WorkflowIssueCode.resourceMissing]: 'common:core.workflow.check.resource_missing',
  [WorkflowIssueCode.resourceNoPermission]: 'common:core.workflow.check.resource_no_permission',
  [WorkflowIssueCode.modelUnavailable]: 'common:core.workflow.check.model_unavailable',
  [WorkflowIssueCode.modelUnavailableShort]: 'common:core.workflow.check.model_unavailable_short',
  [WorkflowIssueCode.modelRequired]: 'common:core.workflow.check.model_required_short',
  // sandbox 复用既有文案，分属 skill 与 app 命名空间。
  [WorkflowIssueCode.sandboxNotConfigured]: 'skill:sandbox_system_not_configured_toast',
  [WorkflowIssueCode.sandboxPlanNotSupported]: 'app:sandbox_free_not_support'
};
