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
  default: ({ source }: { source: string }) => React.createElement('pre', null, source)
}));

const preview: WorkflowBuilderPreviewInteractive = {
  type: 'workflowBuilderPreview',
  previewId: 'preview-1',
  params: {
    title: 'Workflow plan',
    mermaid: 'flowchart LR\n  Start --> Answer',
    sections: [{ title: 'Plan details', content: 'Return a Chinese summary.' }],
    actions: [
      { value: 'confirm', label: 'Confirm and build', inputMode: 'none' },
      { value: 'revise', label: 'Revise the plan', inputMode: 'text' },
      { value: 'cancel', label: 'Cancel this build', inputMode: 'none' }
    ]
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

  it('keeps the diagram when there are no explanatory sections', () => {
    const html = renderToStaticMarkup(
      React.createElement(RenderWorkflowBuilderPreview, {
        interactive: { ...preview, params: { ...preview.params, sections: [] } }
      })
    );
    expect(html).toContain('```mermaid');
    expect(html).not.toContain('Plan details');
  });
});
