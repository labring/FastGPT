import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';
import type AgentAskComposer from '@/components/core/chat/ChatContainer/ChatBox/Input/AgentAskComposer';
import type { AgentAskAnswerDetail } from '@/components/core/chat/ChatContainer/ChatBox/Input/AgentAskComposer';
import { WorkflowBuilderPreviewComposer } from '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/WorkflowBuilderPreviewComposer';

const mocks = vi.hoisted(() => ({ composer: vi.fn(), continueInteractive: vi.fn() }));

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
    sections: [],
    actions: [
      { value: 'confirm', label: '确认并开始搭建', inputMode: 'none' },
      { value: 'revise', label: '修改方案', inputMode: 'text' },
      { value: 'cancel', label: '取消本次搭建', inputMode: 'none' }
    ]
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

  it.each<{ detail: AgentAskAnswerDetail; value: string }>([
    { detail: { kind: 'option', value: 'confirm' }, value: '确认并开始搭建' },
    { detail: { kind: 'option', value: 'cancel' }, value: '取消本次搭建' },
    { detail: { kind: 'skip' }, value: '取消本次搭建' },
    { detail: { kind: 'custom', value: '  增加审核分支  ' }, value: '增加审核分支' }
  ])('submits only the question and readable value: $value', async ({ detail, value }) => {
    await act(async () =>
      root.render(React.createElement(WorkflowBuilderPreviewComposer, { interactive }))
    );
    const { onSubmit } = mocks.composer.mock.calls[0][0] as React.ComponentProps<
      typeof AgentAskComposer
    >;

    await act(async () => onSubmit([], [detail]));

    expect(mocks.continueInteractive).toHaveBeenCalledExactlyOnceWith({
      select: {
        type: 'workflowBuilderPreview',
        questions: [{ question: interactive.params.title, value }]
      }
    });
  });
});
