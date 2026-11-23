import React, { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import Copilot, {
  type OnOptimizeCodeProps
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCode/Copilot';

const { updateNode, toast } = vi.hoisted(() => ({ updateNode: vi.fn(), toast: vi.fn() }));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chakra-ui/react')>()),
  Box: ({ children }: { children: ReactNode }) => children,
  Flex: ({ children }: { children: ReactNode }) => children,
  Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) =>
    React.createElement('button', { onClick }, children),
  CloseButton: () => null
}));
vi.mock('@/components/Markdown', () => ({ default: () => null }));
vi.mock('@/components/Select/AIModelSelector', () => ({ default: () => null }));
vi.mock('@/web/common/api/fetch', () => ({
  onOptimizeCode: async ({ onResult }: OnOptimizeCodeProps) => {
    onResult('function main() { return { result: 1 }; }');
  }
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name, onClick }: { name: string; onClick?: () => void }) =>
    onClick ? React.createElement('button', { onClick }, name) : null
}));
vi.mock('@fastgpt/web/components/common/MyPopover', () => ({
  default: ({ children }: { children: (props: { onClose: () => void }) => ReactNode }) =>
    children({ onClose: () => {} })
}));
vi.mock('@fastgpt/web/components/common/Textarea/PromptEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    React.createElement('button', { 'data-prompt': '', onClick: () => onChange('Optimize') }, value)
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/web/core/workflow/editor/react/useNode', () => ({
  useNodeActions: () => ({ updateNode })
}));
vi.mock('@/web/core/workflow/editor/react/useWorkflow', () => ({
  useWorkflowActions: () => ({ getEdges: () => [] })
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/useWorkflowDocument',
  () => ({ useNodeWorkflowDocument: () => ({ getNodeById: () => ({ inputs: [], outputs: [] }) }) })
);

it('keeps the prompt and reports failure when the Runtime rejects the generated update', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  const click = (label: string) =>
    act(async () => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === label)!
        .click();
    });
  try {
    updateNode.mockReturnValueOnce({ ok: false, error: { message: 'Rejected' } });
    await act(async () =>
      root.render(
        React.createElement(Copilot, { nodeId: 'code', inputs: [], outputs: [], trigger: null })
      )
    );
    await click('');
    await click('core/chat/sendLight');
    await click('app:apply_code');
    expect(updateNode).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenLastCalledWith({ status: 'error', title: 'app:apply_code_failed' });
    expect(container.querySelector('[data-prompt]')?.textContent).toBe('Optimize');

    updateNode.mockReturnValueOnce({ ok: true });
    await click('app:apply_code');
    expect(toast).toHaveBeenLastCalledWith({
      status: 'success',
      title: 'app:code_applied_successfully'
    });
    expect(container.querySelector('[data-prompt]')?.textContent).toBe('');
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  }
});
