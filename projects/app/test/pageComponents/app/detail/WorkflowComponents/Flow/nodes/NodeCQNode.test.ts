import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  inputs: [] as Array<Record<string, any>>,
  sourceInputs: [] as Array<Record<string, any>>
}));

vi.mock('@chakra-ui/react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Box: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', props, children),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', props, children),
  Flex: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', props, children),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
    React.createElement('textarea', props)
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@xyflow/react', () => ({ Position: { Right: 'right' } }));
vi.mock('@fastgpt/global/common/string/tools', () => ({ getNanoid: () => 'new-key' }));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/components/Container', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput', () => ({
  default: ({
    CustomComponent
  }: {
    CustomComponent: Record<string, (input: unknown) => React.ReactNode>;
  }) => CustomComponent.agents({ key: 'agents', value: mockState.sourceInputs[0]?.value })
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name, onClick }: { name: string; onClick?: () => void }) =>
    React.createElement('button', { type: 'button', 'data-icon': name, onClick })
}));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle', () => ({
  MySourceHandle: () => null
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/useWorkflowDocument',
  () => ({
    useIsToolNode: () => false
  })
);
vi.mock('@/web/core/workflow/utils', () => ({
  getOutputDisconnectCommands: () => [],
  splitToolInputsByMode: (inputs: unknown[]) => ({ commonInputs: inputs })
}));
vi.mock('@fastgpt/web/hooks/useMemoEnhance', () => ({
  useMemoEnhance: (fn: () => unknown) => fn()
}));
vi.mock('@/web/core/workflow/editor/react/useNode', () => ({
  useNode: (_nodeId: string, selector: (node: unknown) => unknown) =>
    selector({ data: { inputs: mockState.sourceInputs } }),
  useNodeActions: () => ({
    updateNode: (
      update: (current: { inputs: typeof mockState.inputs }) => { inputs: typeof mockState.inputs }
    ) => {
      const patch = update({ inputs: mockState.inputs });
      mockState.inputs = patch.inputs;
    }
  })
}));
vi.mock('@/web/core/workflow/editor/react/useWorkflow', () => ({
  useWorkflowActions: () => ({ getEdges: () => [] })
}));

import NodeCQNode from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCQNode';

const reactGlobals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe('NodeCQNode current agent updates', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    root = createRoot(container);
    mockState.sourceInputs = [
      {
        key: 'agents',
        value: [
          { key: 'a', value: 'A' },
          { key: 'b', value: 'B' }
        ]
      }
    ];
    mockState.inputs = structuredClone(mockState.sourceInputs);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('preserves intervening agent edits across add, edit and delete callbacks', () => {
    act(() => root.render(React.createElement(NodeCQNode, { data: { nodeId: 'node' } } as never)));

    // Simulate another current-state write after these handlers were rendered.
    mockState.inputs = [
      {
        key: 'agents',
        value: [
          { key: 'a', value: 'A' },
          { key: 'b', value: 'B' },
          { key: 'c', value: 'C' }
        ]
      }
    ];

    act(() => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.includes('Add question type'))
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(mockState.inputs[0]?.value).toEqual([
      { key: 'a', value: 'A' },
      { key: 'b', value: 'B' },
      { key: 'c', value: 'C' },
      { key: 'new-key', value: '' }
    ]);

    const textareas = container.querySelectorAll('textarea');
    act(() => {
      const textarea = textareas[0];
      if (textarea) {
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(
          textarea,
          'A updated'
        );
        textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
      }
    });
    expect(mockState.inputs[0]?.value).toContainEqual({ key: 'c', value: 'C' });
    expect(mockState.inputs[0]?.value).toContainEqual({ key: 'new-key', value: '' });

    act(() => {
      container
        .querySelector('[data-icon="circleMinus"]')
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(mockState.inputs[0]?.value).toEqual([
      { key: 'b', value: 'B' },
      { key: 'c', value: 'C' },
      { key: 'new-key', value: '' }
    ]);

    // A document history restore must also replace the textarea's rendered value.
    mockState.sourceInputs = [{ key: 'agents', value: [{ key: 'a', value: 'A restored' }] }];
    act(() => root.render(React.createElement(NodeCQNode, { data: { nodeId: 'node' } } as never)));
    expect(container.querySelector('textarea')?.value).toBe('A restored');
  });
});
