import { describe, expect, it } from 'vitest';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { WorkflowBuilderPreviewAction } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import {
  adaptLegacyAgentPlanAskToReadonlyAgentAsk,
  getToolDisplayName,
  getWorkflowBuilderVersionButtonState,
  getWorkflowBuilderToolDisplayName,
  getWorkflowBuilderToolPresentation,
  resolveWorkflowBuilderPreviewAnswerAction,
  workflowBuilderAppliedFeedbackDuration
} from '@/components/core/chat/components/AIResponseBox/utils';

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

describe('AIResponseBox utils', () => {
  it('adapts legacy agent plan ask as a submitted readonly agent ask', () => {
    expect(
      adaptLegacyAgentPlanAskToReadonlyAgentAsk({
        type: 'agentPlanAskQuery',
        askId: 'ask-1',
        params: {
          content: 'Which direction?',
          reason: 'Need clarification',
          options: ['A', 'B'],
          answer: 'B'
        }
      })
    ).toEqual({
      type: 'agentAsk',
      askId: 'ask-1',
      params: {
        description: 'Need clarification',
        questions: [
          {
            question: 'Which direction?',
            options: [
              { summary: 'A', value: 'A' },
              { summary: 'B', value: 'B' }
            ],
            answer: 'B'
          }
        ],
        submitted: true
      }
    });
  });

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
    expect(getWorkflowBuilderToolDisplayName('workflow_cli_query')).toBe(
      i18nT('workflow:workflow_builder_tool_query')
    );
    expect(getWorkflowBuilderToolPresentation('other_tool')).toBeUndefined();
    expect(getWorkflowBuilderToolDisplayName('other_tool')).toBeUndefined();
  });

  it('uses the current locale for Builder tools instead of the persisted historical name', () => {
    expect(
      getToolDisplayName({
        functionName: 'workflow_cli_query',
        toolName: '历史语言中的工具名称'
      })
    ).toBe(i18nT('workflow:workflow_builder_tool_query'));
    expect(
      getToolDisplayName({
        functionName: 'other_tool',
        toolName: 'Custom tool name'
      })
    ).toBe('Custom tool name');
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
