import { JSDOM } from 'jsdom';
import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';
import type AIResponseBox from '@/components/core/chat/components/AIResponseBox';
import type RenderProcessingCollapse from '@/components/core/chat/components/AIResponseBox/RenderProcessingCollapse';
import type { AIChatBubbleContentProps } from '@/components/core/chat/ChatContainer/ChatBox/components/AIChatBubble/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: { children?: ReactNode }) =>
    React.createElement('div', null, children);
  return { Box: Container, Flex: Container };
});

// 只替换叶子展示，保留内容组件的真实分组、顺序和预览交互状态。
vi.mock('@/components/core/chat/components/AIResponseBox', () => ({
  default: ({
    value,
    showProcessing = true,
    showFoldableProcessing = true,
    showAnswer = true,
    showInteractive = true,
    showWorkflowBuilderVersion = true,
    isLastResponseValue,
    defaultExpandedProcessingTarget
  }: React.ComponentProps<typeof AIResponseBox>) => {
    const elements: ReactNode[] = [];
    if (showProcessing && showFoldableProcessing && value.reasoning && !value.hideReason) {
      elements.push(
        React.createElement(
          'span',
          { key: 'reasoning', 'data-content': 'reasoning' },
          value.reasoning.content
        )
      );
    }
    if (showProcessing && showFoldableProcessing) {
      const tools = value.tools ?? (value.tool ? [value.tool] : []);
      tools.forEach((tool) => {
        elements.push(
          React.createElement('span', { key: tool.id, 'data-content': 'tool' }, tool.id)
        );
      });
    }
    if (showAnswer && value.text?.content) {
      elements.push(
        React.createElement('p', { key: 'answer', 'data-content': 'answer' }, value.text.content)
      );
    }
    if (showInteractive && value.interactive) {
      elements.push(
        React.createElement(
          'div',
          { key: 'interactive', 'data-content': 'interactive' },
          value.interactive.type
        )
      );
    }
    if (showWorkflowBuilderVersion && value.workflowBuilderVersion) {
      elements.push(
        React.createElement(
          'button',
          { key: 'version', 'data-content': 'version' },
          value.workflowBuilderVersion.name
        )
      );
    }
    return React.createElement(
      'div',
      {
        'data-response': '',
        'data-last': String(isLastResponseValue),
        'data-target': defaultExpandedProcessingTarget
          ? JSON.stringify(defaultExpandedProcessingTarget)
          : undefined
      },
      elements
    );
  }
}));

vi.mock('@/components/core/chat/components/AIResponseBox/RenderProcessingCollapse', () => ({
  default: ({
    children,
    title,
    preview,
    isProcessing,
    onPreviewOpen
  }: React.ComponentProps<typeof RenderProcessingCollapse>) =>
    React.createElement(
      'section',
      {
        'data-process': title ?? 'standard',
        'data-active': String(isProcessing)
      },
      isProcessing && preview
        ? React.createElement(
            'button',
            { 'data-preview-trigger': '', onClick: onPreviewOpen },
            preview
          )
        : null,
      children
    )
}));

vi.mock(
  '@/components/core/chat/components/AIResponseBox/RenderProcessingPreview',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/components/core/chat/components/AIResponseBox/RenderProcessingPreview')
      >();
    return { ...actual, default: () => React.createElement('span', null, 'Preview') };
  }
);

export const contentProps = (
  overrides: Partial<AIChatBubbleContentProps> = {}
): AIChatBubbleContentProps => ({
  dataId: 'response-1',
  chatValue: [],
  isLastChild: true,
  isChatting: false,
  onOpenCiteModal: () => {},
  ...overrides
});

export const confirmedPreview: AIChatItemValueItemType = {
  interactive: {
    type: 'workflowBuilderPreview',
    previewId: 'preview-1',
    entryNodeIds: [],
    memoryEdges: [],
    nodeOutputs: [],
    params: {
      title: 'Preview',
      mermaid: 'flowchart LR',
      sections: [],
      actions: [
        { value: 'confirm', label: 'Confirm', inputMode: 'none' },
        { value: 'revise', label: 'Revise', inputMode: 'text' },
        { value: 'cancel', label: 'Cancel', inputMode: 'none' }
      ],
      answerValue: 'confirm'
    }
  }
};

export const versionValue: AIChatItemValueItemType = {
  workflowBuilderVersion: {
    versionNo: 1,
    name: 'Workflow v1',
    filename: 'workflow.json',
    checksum: `sha256:${'0'.repeat(64)}`,
    generatedAt: '2026-08-12T10:00:00.000Z'
  }
};

/** 三个内容组件共用 DOM 生命周期与叶子展示替身，避免重复搭建浏览器环境。 */
export const setupContentTest = () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.unstubAllGlobals();
  });

  return {
    get container() {
      return container;
    },
    render: async (element: ReactNode) => {
      await act(async () => root.render(element));
    }
  };
};
