import type { TFunction } from 'next-i18next';
import {
  WorkflowIssueCode,
  type WorkflowIssueCode as WorkflowIssueCodeType
} from '@fastgpt/global/core/workflow/editor/issueCode';
import appErrList, { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import pluginErrList, { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { isToolNotExistError } from '@fastgpt/global/core/app/utils';
import { PluginStatusEnum, type PluginStatusType } from '@fastgpt/global/core/plugin/type';
import type {
  WorkflowConfigIssue,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import type { WorkflowCheckIssue } from '@fastgpt/global/core/workflow/type/node';

/** Issue 渲染入参：节点问题与工作流级问题共用 code + params 约定。 */
export type WorkflowIssueLike = WorkflowCheckIssue | WorkflowConfigIssue;

export type WorkflowIssueUIStatus = 'pending_improve' | 'pending_handle';

/** 待处理：引用失效、工具不可用、模型与虚拟机不可用，都需要用户先修外部依赖。其余是待完善。 */
const PENDING_HANDLE_CODES = new Set<string>([
  'invalid_reference',
  'invalid_reference_type',
  'unreachable_reference',
  'tool_missing',
  'tool_load_failed',
  'tool_no_permission',
  'tool_offline',
  'resource_missing',
  'resource_no_permission',
  'model_unavailable',
  'model_unavailable_short',
  'sandbox_not_configured',
  'sandbox_plan_not_supported'
]);

/** 按 issue code 映射节点提示条的状态前缀，不直接使用 level 字段。 */
export const getWorkflowIssueUIStatus = (code: WorkflowIssueLike['code']): WorkflowIssueUIStatus =>
  PENDING_HANDLE_CODES.has(code) ? 'pending_handle' : 'pending_improve';

const PLUGIN_DATA_PERMISSION_ERROR_CODES = new Set<string>([
  AppErrEnum.unAuthApp,
  PluginErrEnum.unAuth
]);

const PLUGIN_DATA_MISSING_ERROR_CODES = new Set<string>([
  AppErrEnum.unExist,
  PluginErrEnum.unExist
]);

const resolvePluginDataErrorIssueCode = (error: string): WorkflowIssueCodeType => {
  if (
    error === 'resource_no_permission' ||
    PLUGIN_DATA_PERMISSION_ERROR_CODES.has(error) ||
    error === ERROR_RESPONSE[AppErrEnum.unAuthApp]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unAuth]?.message
  ) {
    return 'resource_no_permission';
  }

  if (
    error === 'tool_missing' ||
    error === 'resource_missing' ||
    PLUGIN_DATA_MISSING_ERROR_CODES.has(error) ||
    error === ERROR_RESPONSE[AppErrEnum.unExist]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unExist]?.message ||
    isToolNotExistError(error)
  ) {
    return 'tool_missing';
  }

  return 'tool_load_failed';
};

/** 将工具状态和插件错误转换成卡片与发布校验共用的 Issue 文案。 */
export const getToolErrorMessage = ({
  status,
  error,
  t
}: {
  status?: PluginStatusType;
  error?: string | null;
  t: TFunction;
}): string | undefined => {
  if (status === PluginStatusEnum.Offline) {
    return renderWorkflowIssueMessage({ level: 'error', code: 'tool_offline' }, t);
  }
  if (!error) return undefined;

  const issueCode = resolvePluginDataErrorIssueCode(error);
  if (issueCode === 'resource_no_permission' || issueCode === 'tool_missing') {
    return renderWorkflowIssueMessage({ level: 'error', code: issueCode }, t);
  }

  const errorText = appErrList[error]?.message || pluginErrList[error]?.message;
  return errorText || error || renderWorkflowIssueMessage({ level: 'error', code: issueCode }, t);
};

/**
 * 发布 gate 的判定入口：按当前环境事实重算整份 Issue View，返回全部 error。
 * chatConfig 桶不属于任何画布节点，排在节点问题之后。
 * Issue View 的数组顺序在增量刷新后不保证是文档顺序，标红节点由调用方按文档顺序另取。
 */
export const collectWorkflowErrorIssues = (runtime: WorkflowRuntimePort) => {
  runtime.refreshIssues('all');
  const { issues, chatConfigIssues } = runtime.getWorkflowIssues();
  return [...issues, ...chatConfigIssues].filter((issue) => issue.level === 'error');
};

/**
 * 渲染 Issue 文案：code 查 i18n key，params 交给 i18next 插值。
 *
 * `params.inputName` 可能是模板里的 i18n key，也可能是用户自定义字段名，因此统一交给
 * i18next 解析；未命中时保留原文。`params.nodeName` 是工作流自身信息，`model` 是纯数据。
 */
export const renderWorkflowIssueMessage = (issue: WorkflowIssueLike, t: TFunction) => {
  const params = issue.params
    ? {
        ...issue.params,
        ...(issue.params.inputName ? { inputName: t(issue.params.inputName as any) } : {})
      }
    : undefined;

  switch (issue.code) {
    case WorkflowIssueCode.requiredInputEmpty:
      return t('common:core.workflow.check.required_input_empty', params);
    case WorkflowIssueCode.noUpstream:
    case WorkflowIssueCode.isolatedNode:
    case WorkflowIssueCode.unreachableFromStart:
      return t('common:core.workflow.check.no_upstream', params);
    case WorkflowIssueCode.invalidReference:
      return t('common:core.workflow.check.invalid_reference', params);
    case WorkflowIssueCode.invalidReferenceType:
      return t('common:core.workflow.check.invalid_reference_type', params);
    case WorkflowIssueCode.unreachableReference:
      return t('common:core.workflow.check.unreachable_reference', params);
    case WorkflowIssueCode.ifElseIncomplete:
    case WorkflowIssueCode.loopRunMissingBreak:
      return t('common:core.workflow.check.if_else_incomplete', params);
    case WorkflowIssueCode.userSelectEmpty:
      return t('common:core.workflow.check.user_select_empty', params);
    case WorkflowIssueCode.userSelectValueEmpty:
      return t('common:core.workflow.check.user_select_value_empty', params);
    case WorkflowIssueCode.formInputEmpty:
      return t('common:core.workflow.check.form_input_empty', params);
    case WorkflowIssueCode.classifyQuestionEmpty:
      return t('common:core.workflow.check.classify_question_empty', params);
    case WorkflowIssueCode.classifyQuestionValueEmpty:
      return t('common:core.workflow.check.classify_question_value_empty', params);
    case WorkflowIssueCode.codeInputIncomplete:
      return t('common:core.workflow.check.code_input_incomplete', params);
    case WorkflowIssueCode.httpUrlEmpty:
      return t('common:core.workflow.check.http_url_empty', params);
    case WorkflowIssueCode.contextExtractEmpty:
      return t('common:core.workflow.check.context_extract_empty', params);
    case WorkflowIssueCode.toolCallEmpty:
      return t('common:core.workflow.check.tool_call_empty', params);
    case WorkflowIssueCode.toolWaitingConfig:
      return t('common:core.workflow.check.tool_inactive', params);
    case WorkflowIssueCode.toolMissing:
    case WorkflowIssueCode.toolOffline:
      return t('common:core.workflow.check.tool_missing', params);
    case WorkflowIssueCode.toolLoadFailed:
      return t('common:core.workflow.check.tool_load_failed', params);
    case WorkflowIssueCode.toolNoPermission:
      return t('common:core.workflow.check.tool_no_permission', params);
    case WorkflowIssueCode.resourceMissing:
      return t('common:core.workflow.check.resource_missing', params);
    case WorkflowIssueCode.resourceNoPermission:
      return t('common:core.workflow.check.resource_no_permission', params);
    case WorkflowIssueCode.modelUnavailable:
      return t('common:core.workflow.check.model_unavailable', params);
    case WorkflowIssueCode.modelUnavailableShort:
      return t('common:core.workflow.check.model_unavailable_short', params);
    case WorkflowIssueCode.modelRequired:
      return t('common:core.workflow.check.model_required_short', params);
    case WorkflowIssueCode.sandboxNotConfigured:
      return t('skill:sandbox_system_not_configured_toast', params);
    case WorkflowIssueCode.sandboxPlanNotSupported:
      return t('app:sandbox_free_not_support', params);
    default:
      return issue.message ?? issue.code;
  }
};
