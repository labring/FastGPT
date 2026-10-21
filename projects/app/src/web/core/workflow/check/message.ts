import type { WorkflowCheckIssue, FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { TFunction } from 'next-i18next';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { type PluginStatusType, PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import appErrList from '@fastgpt/global/common/error/code/app';
import pluginErrList from '@fastgpt/global/common/error/code/plugin';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { ParseKeys } from '@fastgpt/web/i18n/i18next';
import { resolvePluginDataErrorIssueCode } from './error';
import type { WorkflowRuleIssue } from '@/web/core/workflow/type';

type WorkflowCheckMessageParams = {
  inputName?: string;
  model?: string;
  nodeName?: string;
  /** Agent 内部资源（工具/技能/知识库）名称。 */
  name?: string;
};

const fieldLabelKeys = {
  variable: i18nT('common:core.workflow.variable'),
  value: i18nT('common:value'),
  dataset_quote: i18nT('common:core.workflow.Dataset quote'),
  question_guide: i18nT('common:core.app.Question Guide'),
  tts: i18nT('common:core.app.tts.Speech model')
} as const;

/** 每个翻译 key 保留静态字面量，避免清理脚本漏识别。 */
const workflowCheckMessageKeys = {
  required_input_empty: i18nT('common:core.workflow.check.required_input_empty'),
  no_upstream: i18nT('common:core.workflow.check.no_upstream'),
  invalid_reference: i18nT('common:core.workflow.check.invalid_reference'),
  if_else_incomplete: i18nT('common:core.workflow.check.if_else_incomplete'),
  user_select_empty: i18nT('common:core.workflow.check.user_select_empty'),
  user_select_value_empty: i18nT('common:core.workflow.check.user_select_value_empty'),
  form_input_empty: i18nT('common:core.workflow.check.form_input_empty'),
  classify_question_empty: i18nT('common:core.workflow.check.classify_question_empty'),
  classify_question_value_empty: i18nT('common:core.workflow.check.classify_question_value_empty'),
  code_input_incomplete: i18nT('common:core.workflow.check.code_input_incomplete'),
  http_url_empty: i18nT('common:core.workflow.check.http_url_empty'),
  context_extract_empty: i18nT('common:core.workflow.check.context_extract_empty'),
  tool_call_empty: i18nT('common:core.workflow.check.tool_call_empty'),
  tool_inactive: i18nT('common:core.workflow.check.tool_inactive'),
  tool_missing: i18nT('common:core.workflow.check.tool_missing'),
  tool_load_failed: i18nT('common:core.workflow.check.tool_load_failed'),
  tool_no_permission: i18nT('common:core.workflow.check.tool_no_permission'),
  model_unavailable: i18nT('common:core.workflow.check.model_unavailable'),
  model_unavailable_short: i18nT('common:core.workflow.check.model_unavailable_short'),
  model_required: i18nT('common:core.workflow.check.model_required_short'),
  resource_missing: i18nT('common:core.workflow.check.resource_missing'),
  resource_no_permission: i18nT('common:core.workflow.check.resource_no_permission'),
  agent_tool_inactive: i18nT('common:core.workflow.check.agent_tool_inactive'),
  agent_tool_waiting_config: i18nT('common:core.workflow.check.agent_tool_waiting_config'),
  agent_tool_missing: i18nT('common:core.workflow.check.agent_tool_missing'),
  agent_tool_offline: i18nT('common:core.workflow.check.agent_tool_offline'),
  agent_skill_missing: i18nT('common:core.workflow.check.agent_skill_missing'),
  agent_dataset_missing: i18nT('common:core.workflow.check.agent_dataset_missing'),
  agent_skill_sandbox_required: i18nT('common:core.workflow.check.agent_skill_sandbox_required')
} as const;

type WorkflowCheckMessageCode = keyof typeof workflowCheckMessageKeys;

/** 只声明问题代码与展示文案不一致的别名，其他代码直接使用对应文案。 */
const WORKFLOW_CHECK_MESSAGE_ALIASES: Record<string, WorkflowCheckMessageCode> = {
  isolated_node: 'no_upstream',
  unreachable_from_start: 'no_upstream',
  tool_waiting_config: 'tool_inactive',
  tool_offline: 'tool_missing',
  loop_run_missing_break: 'if_else_incomplete',
  variable_update_incomplete: 'code_input_incomplete'
};

/** 待处理：引用无效、工具不可访问或加载失败。其余均为待完善。 */
const WORKFLOW_CHECK_PENDING_HANDLE_CODES = new Set<string>([
  'invalid_reference',
  'tool_missing',
  'tool_load_failed',
  'tool_no_permission',
  'tool_offline',
  'model_unavailable',
  'resource_missing',
  'resource_no_permission'
]);

export type WorkflowCheckUIStatus = 'pending_improve' | 'pending_handle';

/** 按 issue code 映射 UI 状态前缀，不直接使用 level 字段。 */
export const getWorkflowCheckIssueUIStatus = (code: string): WorkflowCheckUIStatus =>
  WORKFLOW_CHECK_PENDING_HANDLE_CODES.has(code) ? 'pending_handle' : 'pending_improve';

/** 根据 issue.code 返回设计稿固定提示文案，不自由拼接或生成表外文案。 */
export const getWorkflowCheckIssueMessage = ({
  issueCode,
  t,
  params
}: {
  issueCode: string;
  t?: TFunction;
  params?: WorkflowCheckMessageParams;
}) => {
  const isWorkflowCheckMessageCode = (code: string): code is WorkflowCheckMessageCode =>
    Object.hasOwn(workflowCheckMessageKeys, code);

  const messageCode = isWorkflowCheckMessageCode(issueCode)
    ? issueCode
    : WORKFLOW_CHECK_MESSAGE_ALIASES[issueCode];
  if (!messageCode) return '';

  if (!t) return workflowCheckMessageKeys[messageCode];

  // 有限文案逐项使用字面量翻译，确保清理脚本能直接识别实际调用的 key。
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
    case 'model_unavailable':
      return t('common:core.workflow.check.model_unavailable', params);
    case 'model_unavailable_short':
      return t('common:core.workflow.check.model_unavailable_short', params);
    case 'model_required':
      return t('common:core.workflow.check.model_required_short', params);
    case 'resource_missing':
      return t('common:core.workflow.check.resource_missing', params);
    case 'resource_no_permission':
      return t('common:core.workflow.check.resource_no_permission', params);
    case 'agent_tool_inactive':
      return t('common:core.workflow.check.agent_tool_inactive', params);
    case 'agent_tool_waiting_config':
      return t('common:core.workflow.check.agent_tool_waiting_config', params);
    case 'agent_tool_missing':
      return t('common:core.workflow.check.agent_tool_missing', params);
    case 'agent_tool_offline':
      return t('common:core.workflow.check.agent_tool_offline', params);
    case 'agent_skill_missing':
      return t('common:core.workflow.check.agent_skill_missing', params);
    case 'agent_dataset_missing':
      return t('common:core.workflow.check.agent_dataset_missing', params);
    case 'agent_skill_sandbox_required':
      return t('common:core.workflow.check.agent_skill_sandbox_required', params);
  }
};

/**
 * 统一提取工具节点或卡片的错误提示文案。
 * 覆盖：已下线 (tool_offline)、无权限 (resource_no_permission)、已删除/不存在 (tool_missing) 以及具体未知报错。
 */
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
    return getWorkflowCheckIssueMessage({ issueCode: 'tool_offline', t });
  }
  if (!error) return undefined;

  const issueCode = resolvePluginDataErrorIssueCode(error);
  if (issueCode === 'resource_no_permission' || issueCode === 'tool_missing') {
    return getWorkflowCheckIssueMessage({ issueCode, t });
  }

  const errorKey = appErrList[error]?.message ?? pluginErrList[error]?.message;
  if (errorKey) {
    return t(errorKey as ParseKeys);
  }

  return error.trim() || getWorkflowCheckIssueMessage({ issueCode: 'tool_load_failed', t });
};

/** 将无副作用规则结果补全为页面使用的问题对象，所有翻译集中在此边界。 */
export const formatWorkflowRuleIssue = ({
  issue,
  node,
  t
}: {
  issue: WorkflowRuleIssue;
  node?: FlowNodeItemType;
  t?: TFunction;
}): WorkflowCheckIssue => {
  const translateLabel = (label: string) => (t ? t(label as ParseKeys) : label);

  /** 优先取 label，空则取 debugLabel 或槽位默认标签，并走 i18n 翻译，避免展示 quoteQA 等内部 key。 */
  const getInputLabel = (input: FlowNodeInputItemType, fallbackLabel?: string) => {
    const nonEmptyLabel = typeof input.label === 'string' && input.label ? input.label : undefined;
    const nonEmptyDebugLabel =
      typeof input.debugLabel === 'string' && input.debugLabel ? input.debugLabel : undefined;
    const rawLabel = nonEmptyLabel ?? nonEmptyDebugLabel ?? fallbackLabel ?? input.key;

    return rawLabel ? translateLabel(rawLabel) : rawLabel;
  };

  const inputName = (() => {
    if (issue.fieldLabel) {
      return translateLabel(fieldLabelKeys[issue.fieldLabel]);
    }
    if (issue.input) {
      return getInputLabel(issue.input, issue.fallbackLabel);
    }
    if (issue.fallbackLabel) {
      return translateLabel(issue.fallbackLabel);
    }
    return undefined;
  })();

  return {
    nodeId: node?.nodeId ?? '__chat_config__',
    nodeName: node?.name,
    nodeType: node?.flowNodeType ?? FlowNodeTypeEnum.workflowStart,
    level: issue.level ?? 'error',
    code: issue.code,
    inputKey: node ? issue.inputKey : inputName,
    message:
      issue.message ??
      getWorkflowCheckIssueMessage({
        issueCode: issue.messageCode ?? issue.code,
        t,
        params: {
          inputName,
          model: issue.model,
          nodeName: node?.name,
          name: issue.resourceName
        }
      })
  };
};
