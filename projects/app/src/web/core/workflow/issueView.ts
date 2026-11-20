import { useTranslation, type TFunction } from 'next-i18next';
import { WorkflowIssueCode } from '@fastgpt/global/core/workflow/editor/issueCode';
import type {
  WorkflowConfigIssue,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import type { WorkflowCheckIssue } from '@fastgpt/global/core/workflow/type/node';
import {
  WorkflowCheckIssueCodeEnum,
  WorkflowDiagnosticCodeEnum
} from '@fastgpt/global/core/workflow/diagnostic/constants';
import { getWorkflowCheckIssueMessage, getWorkflowInputName } from './check/message';

/** Issue 渲染入参：节点问题与工作流级问题共用 code + params 约定。 */
export type WorkflowIssueLike = WorkflowCheckIssue | WorkflowConfigIssue;

export type WorkflowIssueUIStatus = 'pending_improve' | 'pending_handle';

const runtimeIssueCodes = new Set<string>(Object.values(WorkflowIssueCode));

/** 待处理：引用失效、工具不可用、模型与虚拟机不可用，都需要用户先修外部依赖。其余是待完善。 */
const PENDING_HANDLE_CODES = new Set<string>([
  'invalid_reference',
  'invalid_reference_type',
  'unreachable_reference',
  WorkflowDiagnosticCodeEnum.referenceTypeMismatch,
  'tool_missing',
  'tool_load_failed',
  'tool_no_permission',
  'tool_offline',
  'agent_tool_abnormal',
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
 * 按 code 翻译 Issue 文案，模板字段名先解析，其他参数直接插值。
 */
export const renderWorkflowIssueMessage = (issue: WorkflowIssueLike, t: TFunction) => {
  const { inputNameKey, ...displayParams } = issue.params ?? {};
  const params = inputNameKey
    ? { ...displayParams, inputName: getWorkflowInputName(issue.params, t) }
    : issue.params;
  const referenceParams = () => ({
    ...params,
    inputName: params?.inputName || t('common:core.workflow.inputType.Reference')
  });

  if (issue.code === WorkflowIssueCode.invalidReferenceType) {
    return t('common:core.workflow.check.invalid_reference_type', referenceParams());
  }
  if (issue.code === WorkflowDiagnosticCodeEnum.referenceTypeMismatch) {
    return t('common:core.workflow.check.reference_type_mismatch', referenceParams());
  }
  if (issue.code === WorkflowIssueCode.unreachableReference) {
    return t('common:core.workflow.check.unreachable_reference', referenceParams());
  }

  if (
    issue.code === WorkflowIssueCode.resourceMissing ||
    issue.code === WorkflowIssueCode.resourceNoPermission
  ) {
    const resourceKind = issue.params?.resourceKind;
    if (resourceKind === 'dataset') {
      return getWorkflowCheckIssueMessage({
        issueCode: WorkflowCheckIssueCodeEnum.agentDatasetAbnormal,
        t
      });
    }
    if (resourceKind === 'skill') {
      return getWorkflowCheckIssueMessage({
        issueCode: WorkflowCheckIssueCodeEnum.agentSkillAbnormal,
        t
      });
    }
  }

  const message = runtimeIssueCodes.has(issue.code)
    ? getWorkflowCheckIssueMessage({ issueCode: issue.code, t, params })
    : undefined;
  return message || (issue.message ?? issue.code);
};

/** 节点提示的状态前缀和文案使用同一翻译上下文。 */
export const useWorkflowIssueTranslation = () => {
  const { t } = useTranslation();
  return {
    t,
    formatIssue: (issue: WorkflowIssueLike) => renderWorkflowIssueMessage(issue, t)
  };
};
