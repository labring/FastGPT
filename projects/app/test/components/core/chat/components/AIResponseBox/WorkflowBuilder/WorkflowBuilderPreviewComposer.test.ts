import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';
import type AgentAskComposer from '@/components/core/chat/ChatContainer/ChatBox/Input/AgentAskComposer';
import type { AgentAskAnswerDetail } from '@/components/core/chat/ChatContainer/ChatBox/Input/AgentAskComposer';
import { WorkflowBuilderPreviewComposer } from '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/WorkflowBuilderPreviewComposer';

const mocks = vi.hoisted(() => ({ composer: vi.fn(), continueInteractive: vi.fn() }));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'workflow:workflow_builder_preview_confirm': '确认并开始搭建',
        'workflow:workflow_builder_preview_revise': '修改方案',
        'workflow:workflow_builder_preview_cancel': '取消本次搭建',
        'workflow:workflow_builder_preview_revise_placeholder': '请输入修改意见'
      })[key] ?? key
  })
}));

vi.mock('@/components/core/chat/ChatContainer/ChatBox/Input/AgentAskComposer', () => ({
  default: (props: React.ComponentProps<typeof AgentAskComposer>) => {
    mocks.composer(props);
    return null;
  }
}));
vi.mock('@/components/core/chat/ChatContainer/context/chatInstanceActionsContext', () => ({
  useChatInstanceActions: () => ({ continueInteractive: mocks.continueInteractive })
}));

const interactive: WorkflowBuilderPreviewInteractive = {
  type: 'workflowBuilderPreview',
  previewId: 'preview-1',
  params: {
    title: '确认工作流方案',
    mermaid: 'flowchart LR; A --> B',
    sections: []
  }
};

describe('WorkflowBuilderPreviewComposer', () => {
  let dom: JSDOM;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM('<div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(dom.window.document.getElementById('root')!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it.each<{
    detail: AgentAskAnswerDetail;
    action: 'confirm' | 'revise' | 'cancel';
    reviseText?: string;
  }>([
    { detail: { kind: 'option', value: 'confirm' }, action: 'confirm' },
    { detail: { kind: 'option', value: 'cancel' }, action: 'cancel' },
    { detail: { kind: 'skip' }, action: 'cancel' },
    {
      detail: { kind: 'custom', value: '  增加审核分支  ' },
      action: 'revise',
      reviseText: '增加审核分支'
    }
  ])('submits a standalone preview reply for $action', async ({ detail, action, reviseText }) => {
    await act(async () =>
      root.render(React.createElement(WorkflowBuilderPreviewComposer, { interactive }))
    );
    const { onSubmit, questions, customOptionLabel } = mocks.composer.mock
      .calls[0][0] as React.ComponentProps<typeof AgentAskComposer>;
    expect(questions[0].options.map((option) => option.value)).toEqual(['confirm', 'cancel']);
    expect(customOptionLabel).toBe('修改方案');
    await act(async () => onSubmit([], [detail]));
    expect(mocks.continueInteractive).toHaveBeenCalledExactlyOnceWith({
      select: {
        type: 'workflowBuilderPreview',
        action,

        ...(reviseText ? { reviseText } : {})
      }
    });
    expect(interactive.params).not.toHaveProperty('actions');
  });
});
