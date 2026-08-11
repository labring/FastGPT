import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import type { WorkflowBuilderPreviewAction } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import {
  adaptLegacyAgentPlanAskToReadonlyAgentAsk,
  onSendPrompt,
  resolveWorkflowBuilderPreviewAnswerAction
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
  beforeEach(() => {
    eventBus.off(EventNameEnum.sendQuestion);
  });

  it('does not request clearing chat input for interactive send event', () => {
    const handler = vi.fn();
    eventBus.on(EventNameEnum.sendQuestion, handler);

    onSendPrompt('A');

    expect(handler).toHaveBeenCalledWith({
      text: 'A',
      focus: true
    });
  });

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
});
