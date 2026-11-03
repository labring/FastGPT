import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowBuilderPreviewInteractive } from '@fastgpt/global/core/workflow/builder/type';
import RenderWorkflowBuilderPreview from '@/components/core/chat/components/AIResponseBox/WorkflowBuilder/RenderWorkflowBuilderPreview';

vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  return { Box: Container, Flex: Container };
});
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
});
