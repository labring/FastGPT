import type { WorkflowCheckIssue, FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { TFunction } from 'next-i18next';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { type PluginStatusType, PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import appErrList from '@fastgpt/global/common/error/code/app';
import pluginErrList from '@fastgpt/global/common/error/code/plugin';
import { resolvePluginDataErrorIssueCode } from './error';
import type { WorkflowRuleIssue } from '@/web/core/workflow/type';

/** 优先取 label，空则取 debugLabel，并走 i18n 翻译，避免展示 quoteQA 等内部 key。 */
const getInputLabel = (input: FlowNodeInputItemType, t?: TFunction) => {
  const modelLabels: Record<string, string> = {
    [NodeInputKeyEnum.aiModelId]: 'common:core.ai.Model',
    [NodeInputKeyEnum.aiModel]: 'common:core.ai.Model',
    [NodeInputKeyEnum.datasetSearchRerankModelId]: 'common:core.dataset.search.ReRank',
    [NodeInputKeyEnum.datasetSearchRerankModel]: 'common:core.dataset.search.ReRank',
    [NodeInputKeyEnum.datasetSearchExtensionModelId]: 'common:core.module.template.Query extension',
    [NodeInputKeyEnum.datasetSearchExtensionModel]: 'common:core.module.template.Query extension',
    [NodeInputKeyEnum.datasetDeepSearchModelId]: 'common:deep_rag_search',
    [NodeInputKeyEnum.datasetDeepSearchModel]: 'common:deep_rag_search'
  };
  const rawLabel =
    (typeof input.label === 'string' && input.label ? input.label : undefined) ||
    (typeof input.debugLabel === 'string' && input.debugLabel ? input.debugLabel : undefined) ||
    modelLabels[input.key] ||
    input.key;

  if (t && rawLabel) {
    return t(rawLabel as any);
  }

  return rawLabel;
};

type WorkflowCheckMessageParams = { inputName?: string; model?: string; nodeName?: string };
type WorkflowCheckMessageCode = keyof typeof workflowCheckMessageFallback;

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

const workflowCheckMessageFallback = {
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
  tool_missing: () => '该工具不存在或已被删除',
  tool_load_failed: () => '工具加载失败，请稍后重试',
  tool_no_permission: () => '当前账号无权限访问该资源',
  model_unavailable: ({ nodeName, inputName } = {}) =>
    `节点「${nodeName ?? ''}」的「${inputName ?? ''}」模型不可用`,
  model_unavailable_short: ({ inputName } = {}) => `「${inputName ?? ''}」模型不可用`,
  model_required: ({ inputName } = {}) => `未配置[${inputName ?? ''}]模型`,
  resource_missing: () => '引用的知识库或技能已删除或不可用，请删除',
  resource_no_permission: () => '无权限访问该资源，请检查权限'
} satisfies Record<string, (params?: WorkflowCheckMessageParams) => string>;

const isWorkflowCheckMessageCode = (code: string): code is WorkflowCheckMessageCode =>
  Object.hasOwn(workflowCheckMessageFallback, code);
const resolveWorkflowCheckMessageCode = (
  issueCode: string
): WorkflowCheckMessageCode | undefined =>
  isWorkflowCheckMessageCode(issueCode) ? issueCode : WORKFLOW_CHECK_MESSAGE_ALIASES[issueCode];
/** 每个翻译 key 保留静态字面量，避免清理脚本漏识别。 */
const workflowCheckTranslations = {
  required_input_empty: (t, params) => t('common:core.workflow.check.required_input_empty', params),
  no_upstream: (t, params) => t('common:core.workflow.check.no_upstream', params),
  invalid_reference: (t, params) => t('common:core.workflow.check.invalid_reference', params),
  if_else_incomplete: (t, params) => t('common:core.workflow.check.if_else_incomplete', params),
  user_select_empty: (t, params) => t('common:core.workflow.check.user_select_empty', params),
  user_select_value_empty: (t, params) =>
    t('common:core.workflow.check.user_select_value_empty', params),
  form_input_empty: (t, params) => t('common:core.workflow.check.form_input_empty', params),
  classify_question_empty: (t, params) =>
    t('common:core.workflow.check.classify_question_empty', params),
  classify_question_value_empty: (t, params) =>
    t('common:core.workflow.check.classify_question_value_empty', params),
  code_input_incomplete: (t, params) =>
    t('common:core.workflow.check.code_input_incomplete', params),
  http_url_empty: (t, params) => t('common:core.workflow.check.http_url_empty', params),
  context_extract_empty: (t, params) =>
    t('common:core.workflow.check.context_extract_empty', params),
  tool_call_empty: (t, params) => t('common:core.workflow.check.tool_call_empty', params),
  tool_inactive: (t, params) => t('common:core.workflow.check.tool_inactive', params),
  tool_missing: (t, params) => t('common:core.workflow.check.tool_missing', params),
  tool_load_failed: (t, params) => t('common:core.workflow.check.tool_load_failed', params),
  tool_no_permission: (t, params) => t('common:core.workflow.check.tool_no_permission', params),
  model_unavailable: (t, params) => t('common:core.workflow.check.model_unavailable', params),
  model_unavailable_short: (t, params) =>
    t('common:core.workflow.check.model_unavailable_short', {
      ...params,
      defaultValue: workflowCheckMessageFallback.model_unavailable_short(params)
    }),
  model_required: (t, params) =>
    t('common:core.workflow.check.model_required_short', {
      ...params,
      defaultValue: workflowCheckMessageFallback.model_required(params)
    }),
  resource_missing: (t, params) => t('common:core.workflow.check.resource_missing', params),
  resource_no_permission: (t, params) =>
    t('common:core.workflow.check.resource_no_permission', params)
} satisfies Record<
  WorkflowCheckMessageCode,
  (t: TFunction, params?: WorkflowCheckMessageParams) => string
>;

/** 根据 issue.code 返回设计稿固定提示文案，不自由拼接或生成表外文案。 */
export const getWorkflowCheckIssueMessage = (
  issueCode: string,
  t?: TFunction,
  params?: WorkflowCheckMessageParams
) => {
  const messageCode = resolveWorkflowCheckMessageCode(issueCode);
  if (!messageCode) return '';

  if (t) {
    return workflowCheckTranslations[messageCode](t, params);
  }
  return workflowCheckMessageFallback[messageCode](params);
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
    return getWorkflowCheckIssueMessage('tool_offline', t);
  }
  if (!error) return undefined;

  const issueCode = resolvePluginDataErrorIssueCode(error);
  if (issueCode === 'resource_no_permission' || issueCode === 'tool_missing') {
    return getWorkflowCheckIssueMessage(issueCode, t);
  }

  const errorText = appErrList[error]?.message || pluginErrList[error]?.message;
  return (
    errorText ||
    (typeof error === 'string' ? error : undefined) ||
    getWorkflowCheckIssueMessage('tool_load_failed', t)
  );
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
  const fieldLabels = {
    variable: () => (t ? t('common:core.workflow.variable') : '变量'),
    value: () => (t ? t('common:value') : '值'),
    dataset_quote: () => (t ? t('common:core.workflow.Dataset quote') : '知识库引用'),
    question_guide: () => (t ? t('common:core.app.Question Guide') : 'Question guide'),
    tts: () => (t ? t('common:core.app.tts.Speech model') : 'Speech model')
  };
  const inputName = issue.fieldLabel
    ? fieldLabels[issue.fieldLabel]()
    : issue.input
      ? getInputLabel(issue.input, t)
      : undefined;
  return {
    nodeId: node?.nodeId ?? '__chat_config__',
    nodeName: node?.name,
    nodeType: node?.flowNodeType ?? FlowNodeTypeEnum.workflowStart,
    level: 'error',
    code: issue.code,
    inputKey: node ? issue.inputKey : inputName,
    message: getWorkflowCheckIssueMessage(issue.messageCode ?? issue.code, t, {
      inputName,
      model: issue.model,
      nodeName: node?.name
    })
  };
};
