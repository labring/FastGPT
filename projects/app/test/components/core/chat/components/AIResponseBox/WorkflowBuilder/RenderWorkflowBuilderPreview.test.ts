import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';
import RenderWorkflowBuilderPreview from '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/RenderWorkflowBuilderPreview';

vi.mock('@chakra-ui/react', () => {
  const Container = ({
    children,
    'data-chat-scroll-anchor': anchor
  }: {
    children?: React.ReactNode;
    'data-chat-scroll-anchor'?: string;
  }) => React.createElement('div', { 'data-chat-scroll-anchor': anchor }, children);
  return {
    Box: Container,
    Flex: Container,
    Text: Container,
    Badge: Container
  };
});
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/Markdown', () => ({
  default: ({ source, forbidZhFormat }: { source: string; forbidZhFormat?: boolean }) =>
    React.createElement('pre', { 'data-forbid-zh-format': String(forbidZhFormat ?? false) }, source)
}));

const preview: WorkflowBuilderPreviewInteractive = {
  type: 'workflowBuilderPreview',

  params: {
    toolCallId: 'preview-1',
    arguments: JSON.stringify({
      title: 'Workflow plan',
      mermaid: 'flowchart LR\n  Start --> Answer',
      sections: [{ title: 'Plan details', content: 'Return a Chinese summary.' }]
    })
  }
};

describe('RenderWorkflowBuilderPreview', () => {
  it.each([undefined, 'confirm', 'revise', 'cancel'] as const)(
    'renders the plan without waiting or selected-answer UI when the answer is %s',
    (answerValue) => {
      const html = renderToStaticMarkup(
        React.createElement(RenderWorkflowBuilderPreview, {
          interactive: {
            ...preview,
            params: { ...preview.params, answerValue, answerText: 'User revision' }
          }
        })
      );

      expect(html).toContain('```mermaid');
      expect(html).toContain('Workflow plan');
      expect(html).toContain('Start --&gt; Answer');
      expect(html).toContain('Plan details');
      expect(html).toContain('Return a Chinese summary.');
      expect(html).not.toContain('User revision');
      expect(html).not.toContain('Confirm and build');
      expect(html).not.toContain('waiting');
    }
  );

  it.each([
    'not JSON',
    JSON.stringify({ title: 'Plan', mermaid: 'flowchart LR\n  A --> B' }),
    JSON.stringify({ ...JSON.parse(preview.params.arguments), sections: [] })
  ])('ignores invalid preview arguments: %s', (argumentsText) => {
    const html = renderToStaticMarkup(
      React.createElement(RenderWorkflowBuilderPreview, {
        interactive: { ...preview, params: { arguments: argumentsText } }
      })
    );
    expect(html).toBe('');
  });

  it.each([
    undefined,
    null,
    {},
    {
      title: 'Legacy plan',
      mermaid: 'flowchart LR\n  A --> B',
      sections: [{ title: 'Details', content: 'Legacy preview' }]
    }
  ])('ignores missing or legacy preview params: %j', (params) => {
    const html = renderToStaticMarkup(
      React.createElement(RenderWorkflowBuilderPreview, {
        interactive: { ...preview, params } as unknown as WorkflowBuilderPreviewInteractive
      })
    );

    expect(html).toBe('');
  });

  it('preserves full-width punctuation in the Mermaid source', () => {
    const mermaid =
      'flowchart LR\n  Start["Form表单输入<br/>岗位要求（必填）<br/>简历文本（未上传文件时）"]';
    const html = renderToStaticMarkup(
      React.createElement(RenderWorkflowBuilderPreview, {
        interactive: {
          ...preview,
          params: {
            arguments: JSON.stringify({ ...JSON.parse(preview.params.arguments), mermaid })
          }
        }
      })
    );

    expect(html).toContain('data-forbid-zh-format="true"');
    expect(html).toContain('岗位要求（必填）');
    expect(html).toContain('简历文本（未上传文件时）');
  });

  it('renders the summary before the diagram without hiding configuration requirements', () => {
    const html = renderToStaticMarkup(
      React.createElement(RenderWorkflowBuilderPreview, {
        interactive: {
          ...preview,
          params: {
            ...preview.params,
            arguments: JSON.stringify({
              ...JSON.parse(preview.params.arguments),
              summary: 'Read a document and return its summary.',
              sections: [{ title: 'Required configuration', content: 'Select a knowledge base.' }]
            })
          }
        }
      })
    );
    expect(html.indexOf('Workflow plan')).toBeLessThan(html.indexOf('Read a document'));
    expect(html.indexOf('Read a document')).toBeLessThan(html.indexOf('```mermaid'));
    expect(html).toContain('Select a knowledge base.');
  });

  it.each([true, false])('only labels the active preview as pending: %s', (isPending) => {
    const html = renderToStaticMarkup(
      React.createElement(RenderWorkflowBuilderPreview, { interactive: preview, isPending })
    );
    expect(html.includes('workflow_builder_preview_pending')).toBe(isPending);
    expect(html.includes('data-chat-scroll-anchor="preview-1"')).toBe(isPending);
  });
});
