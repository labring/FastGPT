import {
  WorkflowCheckIssueCodeEnum,
  WorkflowDiagnosticCodeEnum
} from '@fastgpt/global/core/workflow/diagnostic/constants';
import { describe, expect, it } from 'vitest';
import {
  getWorkflowCheckIssueMessage,
  getWorkflowCheckIssueUIStatus,
  getToolErrorMessage
} from '@/web/core/workflow/check/message';
import commonZh from '@fastgpt/web/i18n/zh-CN/common.json';
import type { TFunction } from 'next-i18next';

describe('workflow check message compatibility', () => {
  const t = ((key: string, params?: Record<string, unknown>) => {
    const text = (commonZh as Record<string, string>)[key.replace('common:', '')] ?? key;
    return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''));
  }) as TFunction;

  it.each([
    [WorkflowCheckIssueCodeEnum.invalidReference, '参数 引用了无效变量，需删除'],
    [WorkflowCheckIssueCodeEnum.ifElseIncomplete, '存在未完成的条件配置，请完善'],
    [WorkflowCheckIssueCodeEnum.userSelectEmpty, '需配置至少一个选项'],
    [WorkflowCheckIssueCodeEnum.userSelectValueEmpty, '选项不可为空'],
    [WorkflowCheckIssueCodeEnum.formInputEmpty, '需配置至少一个字段'],
    [WorkflowCheckIssueCodeEnum.classifyQuestionEmpty, '需配置至少一个分类'],
    [WorkflowCheckIssueCodeEnum.classifyQuestionValueEmpty, '分类值不可为空'],
    [WorkflowCheckIssueCodeEnum.codeInputIncomplete, '存在未完成的输入变量配置，请完善'],
    [WorkflowCheckIssueCodeEnum.httpUrlEmpty, '需配置请求地址'],
    [WorkflowCheckIssueCodeEnum.contextExtractEmpty, '需配置至少一个目标字段'],
    [WorkflowCheckIssueCodeEnum.toolCallEmpty, '需配置工具或开启虚拟机'],
    [WorkflowCheckIssueCodeEnum.toolWaitingConfig, '该工具尚未激活，请激活使用'],
    [WorkflowCheckIssueCodeEnum.toolNoPermission, '当前账号无权限访问该资源'],
    [WorkflowCheckIssueCodeEnum.resourceMissing, '引用的知识库或技能已删除或不可用，请删除']
  ] as const)('preserves existing copy for %s', (issueCode, expected) => {
    expect(getWorkflowCheckIssueMessage({ issueCode, t, params: { inputName: '参数' } })).toBe(
      expected
    );
  });

  it('keeps pending statuses independent of translated text and handles blank or unknown errors', () => {
    expect(getWorkflowCheckIssueUIStatus(WorkflowCheckIssueCodeEnum.resourceMissing)).toBe(
      'pending_handle'
    );
    expect(getWorkflowCheckIssueUIStatus(WorkflowCheckIssueCodeEnum.requiredInputEmpty)).toBe(
      'pending_improve'
    );
    expect(
      getWorkflowCheckIssueMessage({ issueCode: WorkflowDiagnosticCodeEnum.schemaInvalid })
    ).toBe('');
    expect(getToolErrorMessage({ error: '   ', t })).toBe('工具加载失败，请稍后重试');
  });
});
