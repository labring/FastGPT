import { WorkflowCheckIssueCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
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

type WorkflowCheckMessageParams = { inputName?: string; model?: string; nodeName?: string };

const fieldLabelKeys = {
  variable: i18nT('common:core.workflow.variable'),
  value: i18nT('common:value'),
  dataset_quote: i18nT('common:core.workflow.Dataset quote'),
  question_guide: i18nT('common:core.app.Question Guide'),
  tts: i18nT('common:core.app.tts.Speech model')
} as const;

/** 每个翻译 key 保留静态字面量，避免清理脚本漏识别。 */
const workflowCheckMessageKeys = {
  [WorkflowCheckIssueCodeEnum.requiredInputEmpty]: i18nT(
    'common:core.workflow.check.required_input_empty'
  ),
  [WorkflowCheckIssueCodeEnum.noUpstream]: i18nT('common:core.workflow.check.no_upstream'),
  [WorkflowCheckIssueCodeEnum.invalidReference]: i18nT(
    'common:core.workflow.check.invalid_reference'
  ),
  [WorkflowCheckIssueCodeEnum.ifElseIncomplete]: i18nT(
    'common:core.workflow.check.if_else_incomplete'
  ),
  [WorkflowCheckIssueCodeEnum.userSelectEmpty]: i18nT(
    'common:core.workflow.check.user_select_empty'
  ),
  [WorkflowCheckIssueCodeEnum.userSelectValueEmpty]: i18nT(
    'common:core.workflow.check.user_select_value_empty'
  ),
  [WorkflowCheckIssueCodeEnum.formInputEmpty]: i18nT('common:core.workflow.check.form_input_empty'),
  [WorkflowCheckIssueCodeEnum.classifyQuestionEmpty]: i18nT(
    'common:core.workflow.check.classify_question_empty'
  ),
  [WorkflowCheckIssueCodeEnum.classifyQuestionValueEmpty]: i18nT(
    'common:core.workflow.check.classify_question_value_empty'
  ),
  [WorkflowCheckIssueCodeEnum.codeInputIncomplete]: i18nT(
    'common:core.workflow.check.code_input_incomplete'
  ),
  [WorkflowCheckIssueCodeEnum.httpUrlEmpty]: i18nT('common:core.workflow.check.http_url_empty'),
  [WorkflowCheckIssueCodeEnum.contextExtractEmpty]: i18nT(
    'common:core.workflow.check.context_extract_empty'
  ),
  [WorkflowCheckIssueCodeEnum.toolCallEmpty]: i18nT('common:core.workflow.check.tool_call_empty'),
  [WorkflowCheckIssueCodeEnum.toolInactive]: i18nT('common:core.workflow.check.tool_inactive'),
  [WorkflowCheckIssueCodeEnum.toolMissing]: i18nT('common:core.workflow.check.tool_missing'),
  [WorkflowCheckIssueCodeEnum.toolLoadFailed]: i18nT('common:core.workflow.check.tool_load_failed'),
  [WorkflowCheckIssueCodeEnum.toolNoPermission]: i18nT(
    'common:core.workflow.check.tool_no_permission'
  ),
  [WorkflowCheckIssueCodeEnum.modelUnavailable]: i18nT(
    'common:core.workflow.check.model_unavailable'
  ),
  [WorkflowCheckIssueCodeEnum.modelUnavailableShort]: i18nT(
    'common:core.workflow.check.model_unavailable_short'
  ),
  [WorkflowCheckIssueCodeEnum.modelRequired]: i18nT(
    'common:core.workflow.check.model_required_short'
  ),
  [WorkflowCheckIssueCodeEnum.resourceMissing]: i18nT(
    'common:core.workflow.check.resource_missing'
  ),
  [WorkflowCheckIssueCodeEnum.resourceNoPermission]: i18nT(
    'common:core.workflow.check.resource_no_permission'
  )
} as const;

type WorkflowCheckMessageCode = keyof typeof workflowCheckMessageKeys;

/** 只声明问题代码与展示文案不一致的别名，其他代码直接使用对应文案。 */
const WORKFLOW_CHECK_MESSAGE_ALIASES: Partial<Record<string, WorkflowCheckMessageCode>> = {
  [WorkflowCheckIssueCodeEnum.isolatedNode]: WorkflowCheckIssueCodeEnum.noUpstream,
  [WorkflowCheckIssueCodeEnum.unreachableFromStart]: WorkflowCheckIssueCodeEnum.noUpstream,
  [WorkflowCheckIssueCodeEnum.toolWaitingConfig]: WorkflowCheckIssueCodeEnum.toolInactive,
  [WorkflowCheckIssueCodeEnum.toolOffline]: WorkflowCheckIssueCodeEnum.toolMissing,
  [WorkflowCheckIssueCodeEnum.loopRunMissingBreak]: WorkflowCheckIssueCodeEnum.ifElseIncomplete,
  [WorkflowCheckIssueCodeEnum.variableUpdateIncomplete]:
    WorkflowCheckIssueCodeEnum.codeInputIncomplete
};

/** 待处理：引用无效、工具不可访问或加载失败。其余均为待完善。 */
const WORKFLOW_CHECK_PENDING_HANDLE_CODES = new Set<WorkflowCheckIssue['code']>([
  WorkflowCheckIssueCodeEnum.invalidReference,
  WorkflowCheckIssueCodeEnum.toolMissing,
  WorkflowCheckIssueCodeEnum.toolLoadFailed,
  WorkflowCheckIssueCodeEnum.toolNoPermission,
  WorkflowCheckIssueCodeEnum.toolOffline,
  WorkflowCheckIssueCodeEnum.modelUnavailable,
  WorkflowCheckIssueCodeEnum.resourceMissing,
  WorkflowCheckIssueCodeEnum.resourceNoPermission
]);

export type WorkflowCheckUIStatus = 'pending_improve' | 'pending_handle';

/** 按 issue code 映射 UI 状态前缀，不直接使用 level 字段。 */
export const getWorkflowCheckIssueUIStatus = (
  code: WorkflowCheckIssue['code']
): WorkflowCheckUIStatus =>
  WORKFLOW_CHECK_PENDING_HANDLE_CODES.has(code) ? 'pending_handle' : 'pending_improve';

/** 根据 issue.code 返回设计稿固定提示文案，不自由拼接或生成表外文案。 */
export const getWorkflowCheckIssueMessage = ({
  issueCode,
  t,
  params
}: {
  issueCode: WorkflowCheckIssue['code'];
  t?: TFunction;
  params?: WorkflowCheckMessageParams;
}) => {
  const isWorkflowCheckMessageCode = (
    code: WorkflowCheckIssue['code']
  ): code is WorkflowCheckMessageCode => Object.hasOwn(workflowCheckMessageKeys, code);

  const messageCode = isWorkflowCheckMessageCode(issueCode)
    ? issueCode
    : WORKFLOW_CHECK_MESSAGE_ALIASES[issueCode];
  if (!messageCode) return '';

  if (!t) return workflowCheckMessageKeys[messageCode];

  // 有限文案逐项使用字面量翻译，确保清理脚本能直接识别实际调用的 key。
  switch (messageCode) {
    case WorkflowCheckIssueCodeEnum.requiredInputEmpty:
      return t('common:core.workflow.check.required_input_empty', params);
    case WorkflowCheckIssueCodeEnum.noUpstream:
      return t('common:core.workflow.check.no_upstream', params);
    case WorkflowCheckIssueCodeEnum.invalidReference:
      return t('common:core.workflow.check.invalid_reference', params);
    case WorkflowCheckIssueCodeEnum.ifElseIncomplete:
      return t('common:core.workflow.check.if_else_incomplete', params);
    case WorkflowCheckIssueCodeEnum.userSelectEmpty:
      return t('common:core.workflow.check.user_select_empty', params);
    case WorkflowCheckIssueCodeEnum.userSelectValueEmpty:
      return t('common:core.workflow.check.user_select_value_empty', params);
    case WorkflowCheckIssueCodeEnum.formInputEmpty:
      return t('common:core.workflow.check.form_input_empty', params);
    case WorkflowCheckIssueCodeEnum.classifyQuestionEmpty:
      return t('common:core.workflow.check.classify_question_empty', params);
    case WorkflowCheckIssueCodeEnum.classifyQuestionValueEmpty:
      return t('common:core.workflow.check.classify_question_value_empty', params);
    case WorkflowCheckIssueCodeEnum.codeInputIncomplete:
      return t('common:core.workflow.check.code_input_incomplete', params);
    case WorkflowCheckIssueCodeEnum.httpUrlEmpty:
      return t('common:core.workflow.check.http_url_empty', params);
    case WorkflowCheckIssueCodeEnum.contextExtractEmpty:
      return t('common:core.workflow.check.context_extract_empty', params);
    case WorkflowCheckIssueCodeEnum.toolCallEmpty:
      return t('common:core.workflow.check.tool_call_empty', params);
    case WorkflowCheckIssueCodeEnum.toolInactive:
      return t('common:core.workflow.check.tool_inactive', params);
    case WorkflowCheckIssueCodeEnum.toolMissing:
      return t('common:core.workflow.check.tool_missing', params);
    case WorkflowCheckIssueCodeEnum.toolLoadFailed:
      return t('common:core.workflow.check.tool_load_failed', params);
    case WorkflowCheckIssueCodeEnum.toolNoPermission:
      return t('common:core.workflow.check.tool_no_permission', params);
    case WorkflowCheckIssueCodeEnum.modelUnavailable:
      return t('common:core.workflow.check.model_unavailable', params);
    case WorkflowCheckIssueCodeEnum.modelUnavailableShort:
      return t('common:core.workflow.check.model_unavailable_short', params);
    case WorkflowCheckIssueCodeEnum.modelRequired:
      return t('common:core.workflow.check.model_required_short', params);
    case WorkflowCheckIssueCodeEnum.resourceMissing:
      return t('common:core.workflow.check.resource_missing', params);
    case WorkflowCheckIssueCodeEnum.resourceNoPermission:
      return t('common:core.workflow.check.resource_no_permission', params);
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
    return getWorkflowCheckIssueMessage({ issueCode: WorkflowCheckIssueCodeEnum.toolOffline, t });
  }
  if (!error) return undefined;

  const issueCode = resolvePluginDataErrorIssueCode(error);
  if (
    issueCode === WorkflowCheckIssueCodeEnum.resourceNoPermission ||
    issueCode === WorkflowCheckIssueCodeEnum.toolMissing
  ) {
    return getWorkflowCheckIssueMessage({ issueCode, t });
  }

  const errorKey = appErrList[error]?.message ?? pluginErrList[error]?.message;
  if (errorKey) {
    return t(errorKey as ParseKeys);
  }

  return (
    error.trim() ||
    getWorkflowCheckIssueMessage({ issueCode: WorkflowCheckIssueCodeEnum.toolLoadFailed, t })
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
          nodeName: node?.name
        }
      })
  };
};
