import { omit } from 'lodash-es';
import { z } from 'zod';
import { WorkflowCheckIssueCodeEnum } from '../diagnostic/constants';

const runtimeIssueCodes = {
  // 这些旧编码仍由应用展示层兼容，Runtime 不生成。
  ...omit(WorkflowCheckIssueCodeEnum, [
    'agentDatasetAbnormal',
    'agentSkillAbnormal',
    'sandboxSystemUnavailable',
    'sandboxPlanUnavailable',
    'toolInactive',
    'variableUpdateIncomplete'
  ]),
  invalidReferenceType: 'invalid_reference_type',
  unreachableReference: 'unreachable_reference',
  sandboxNotConfigured: 'sandbox_not_configured',
  sandboxPlanNotSupported: 'sandbox_plan_not_supported'
} as const;

/**
 * Workflow Issue 的稳定标识集合。
 *
 * Issue 只携带 code 与插值参数，不携带文案：判定规则在 Runtime，文案解析在渲染层，
 * 因此切换语言只需要重新渲染，不需要重算 Issue View。
 * 新增规则时在 App 的 Issue 渲染入口补充对应文案。
 */
export const WorkflowIssueCode: {
  // 保留 Runtime 原有的字符串字面量联合类型，兼容现有 Issue 生成方。
  [Code in keyof typeof runtimeIssueCodes]: `${(typeof runtimeIssueCodes)[Code]}`;
} = runtimeIssueCodes;

export const WorkflowIssueCodeSchema = z.enum(WorkflowIssueCode);

export type WorkflowIssueCode = z.infer<typeof WorkflowIssueCodeSchema>;
