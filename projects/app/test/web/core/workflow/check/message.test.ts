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
    ['invalid_reference', '参数 引用了无效变量，需删除'],
    ['if_else_incomplete', '存在未完成的条件配置，请完善'],
    ['user_select_empty', '需配置至少一个选项'],
    ['user_select_value_empty', '选项不可为空'],
    ['form_input_empty', '需配置至少一个字段'],
    ['classify_question_empty', '需配置至少一个分类'],
    ['classify_question_value_empty', '分类值不可为空'],
    ['code_input_incomplete', '存在未完成的输入变量配置，请完善'],
    ['http_url_empty', '需配置请求地址'],
    ['context_extract_empty', '需配置至少一个目标字段'],
    ['tool_call_empty', '需配置工具或开启虚拟机'],
    ['tool_waiting_config', '该工具尚未激活，请激活使用'],
    ['tool_no_permission', '当前账号无权限访问该资源'],
    ['resource_missing', '引用的知识库或技能已删除或不可用，请删除']
  ])('preserves existing copy for %s', (issueCode, expected) => {
    expect(getWorkflowCheckIssueMessage({ issueCode, t, params: { inputName: '参数' } })).toBe(
      expected
    );
  });

  it('keeps pending statuses independent of translated text and handles blank or unknown errors', () => {
    expect(getWorkflowCheckIssueUIStatus('resource_missing')).toBe('pending_handle');
    expect(getWorkflowCheckIssueUIStatus('required_input_empty')).toBe('pending_improve');
    expect(getWorkflowCheckIssueMessage({ issueCode: 'unknown' })).toBe('');
    expect(getToolErrorMessage({ error: '   ', t })).toBe('工具加载失败，请稍后重试');
  });
});
