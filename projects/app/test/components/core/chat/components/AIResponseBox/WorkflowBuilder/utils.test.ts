import { describe, expect, it } from 'vitest';
import type { WorkflowBuilderPreviewAction } from '@fastgpt/global/core/workflow/builder/type';
import {
  getWorkflowBuilderVersionButtonState,
  getWorkflowBuilderToolDisplayName,
  getWorkflowBuilderToolPresentation,
  resolveWorkflowBuilderPreviewAnswerAction,
  workflowBuilderAppliedFeedbackDuration
} from '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/utils';

const actions: WorkflowBuilderPreviewAction[] = [
  { value: 'confirm', label: '确认并开始搭建', inputMode: 'none' },
  {
    value: 'revise',
    label: '修改方案',
    inputMode: 'text',
    inputPlaceholder: '请描述需要调整的地方'
  },
  { value: 'cancel', label: '取消本次搭建', inputMode: 'none' }
];

describe('WorkflowBuilder utils', () => {
  it('keeps option answers mapped to the selected Builder action', () => {
    expect(
      resolveWorkflowBuilderPreviewAnswerAction({
        actions,
        customAction: actions[1],
        answerDetail: { kind: 'option', value: 'confirm' }
      })
    ).toEqual({ action: actions[0] });
  });

  it('keeps custom text answers mapped to the revise Builder action', () => {
    expect(
      resolveWorkflowBuilderPreviewAnswerAction({
        actions,
        customAction: actions[1],
        answerDetail: { kind: 'custom', value: '  帮我减少节点  ' }
      })
    ).toEqual({ action: actions[1], text: '帮我减少节点' });
  });

  it('maps the Composer close/skip action to cancel Builder action', () => {
    expect(
      resolveWorkflowBuilderPreviewAnswerAction({
        actions,
        customAction: actions[1],
        answerDetail: { kind: 'skip' }
      })
    ).toEqual({ action: actions[2] });
  });

  it('restores localized presentation metadata for legacy Workflow Builder tools', () => {
    expect(getWorkflowBuilderToolPresentation('workflow_cli_query')).toEqual({
      nameKey: 'workflow:workflow_builder_tool_query',
      avatar: 'core/chat/workflowBuilder/query'
    });
    expect(getWorkflowBuilderToolPresentation('other_tool')).toBeUndefined();
    expect(getWorkflowBuilderToolDisplayName({ functionName: 'other_tool', t: (key) => key })).toBe(
      ''
    );
  });

  it('translates Builder tools and legacy tool keys through the supplied t', () => {
    const mockTranslations: Record<string, string> = {
      'workflow:workflow_builder_tool_query': '查看现状',
      'workflow:workflow_builder_tool_preview': '方案预览'
    };
    const t = (key: string) => mockTranslations[key] || key;

    expect(getWorkflowBuilderToolDisplayName({ functionName: 'workflow_cli_query', t })).toBe(
      '查看现状'
    );
    expect(
      getWorkflowBuilderToolDisplayName({ functionName: 'workflow_builder_present_preview', t })
    ).toBe('方案预览');

    expect(
      getWorkflowBuilderToolDisplayName({
        functionName: 'workflow_builder_present_preview',
        toolName: 'Raw name',
        t
      })
    ).toBe('方案预览');

    expect(
      getWorkflowBuilderToolDisplayName({
        functionName: 'unknown_tool',
        toolName: 'Custom Tool',
        t
      })
    ).toBe('Custom Tool');

    expect(
      getWorkflowBuilderToolDisplayName({ toolName: 'workflow:workflow_builder_tool_query', t })
    ).toBe('查看现状');
    expect(getWorkflowBuilderToolDisplayName({ t })).toBe('');
  });

  it('uses the current locale for Builder tools instead of the persisted historical name', () => {
    const tool = { functionName: 'workflow_cli_query', toolName: '历史语言中的工具名称' };
    const zh = (key: string) => (key === 'workflow:workflow_builder_tool_query' ? '查看现状' : key);
    const en = (key: string) =>
      key === 'workflow:workflow_builder_tool_query' ? 'Inspect workflow' : key;
    expect(getWorkflowBuilderToolDisplayName({ ...tool, t: zh })).toBe('查看现状');
    expect(getWorkflowBuilderToolDisplayName({ ...tool, t: en })).toBe('Inspect workflow');
  });

  it('maps Workflow Builder version facts to the Figma button states', () => {
    expect(
      getWorkflowBuilderVersionButtonState({
        displayState: 'available',
        loading: false,
        showApplied: false
      })
    ).toBe('apply');
    expect(
      getWorkflowBuilderVersionButtonState({
        displayState: 'available',
        loading: true,
        showApplied: false
      })
    ).toBe('loading');
    expect(
      getWorkflowBuilderVersionButtonState({
        displayState: 'available',
        loading: false,
        showApplied: true
      })
    ).toBe('applied');
    expect(
      getWorkflowBuilderVersionButtonState({
        displayState: 'expired',
        loading: true,
        showApplied: true
      })
    ).toBe('expired');
    expect(workflowBuilderAppliedFeedbackDuration).toBe(1200);
  });
});
