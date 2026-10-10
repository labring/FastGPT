import type { TFunction } from 'next-i18next';
import { WORKFLOW_ISSUE_I18N_KEYS } from '@fastgpt/global/core/workflow/editor/issueCode';
import type { WorkflowIssueCode } from '@fastgpt/global/core/workflow/editor/issueCode';
import type {
  WorkflowConfigIssue,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import type { WorkflowCheckIssue } from '@fastgpt/global/core/workflow/type/node';

/** Issue 渲染入参：节点问题与工作流级问题共用 code + params 约定。 */
export type WorkflowIssueLike = WorkflowCheckIssue | WorkflowConfigIssue;

export type WorkflowIssueUIStatus = 'pending_improve' | 'pending_handle';

/** 待处理：引用失效、工具不可用、模型与虚拟机不可用，都需要用户先修外部依赖。其余是待完善。 */
const PENDING_HANDLE_CODES = new Set<WorkflowIssueCode>([
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
export const getWorkflowIssueUIStatus = (code: WorkflowIssueCode): WorkflowIssueUIStatus =>
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
 * 渲染 Issue 文案：code 查 i18n key，params 交给 i18next 插值。
 *
 * `params.inputName`、`params.nodeName` 和 `params.model` 都是 Issue 产生时确定的插值数据；
 * 不把用户输入或文档字段再次当作翻译 key，避免动态 key 绕过静态收集。
 */
export const renderWorkflowIssueMessage = (issue: WorkflowIssueLike, t: TFunction) => {
  const key = WORKFLOW_ISSUE_I18N_KEYS[issue.code] as any;
  const params = issue.params;
  return params ? t(key, params) : t(key);
};
