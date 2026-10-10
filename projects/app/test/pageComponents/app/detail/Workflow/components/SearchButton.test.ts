import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fitView: vi.fn(),
  getNodeDimension: vi.fn(),
  getNodes: vi.fn(() => [{ id: 'alpha-1' }, { id: 'alpha-2' }]),
  getWorkflow: vi.fn(),
  patchViewData: vi.fn(),
  selectNodes: vi.fn()
}));

vi.mock('@chakra-ui/react', () => {
  const primitive = (tag: string) => {
    const Primitive = ({ children }: Record<string, any>) =>
      React.createElement(tag, undefined, children);
    Primitive.displayName = tag;

    return Primitive;
  };

  return {
    Box: primitive('div'),
    Flex: primitive('div'),
    Input: ({ value, placeholder, onFocus, onChange, onKeyDown }: Record<string, any>) =>
      React.createElement('input', {
        value,
        placeholder,
        onFocus,
        onChange,
        onKeyDown
      }),
    Button: ({ children, isDisabled, ...props }: Record<string, any>) =>
      React.createElement('button', { onClick: props.onClick, disabled: isDisabled }, children),
    IconButton: ({ icon, onClick }: Record<string, any>) =>
      React.createElement('button', { onClick }, icon)
  };
});

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('reactflow', () => ({
  useReactFlow: () => ({ fitView: mocks.fitView })
}));

vi.mock('ahooks', async () => {
  const React = await import('react');
  return {
    useKeyPress: () => undefined,
    useThrottleEffect: (effect: () => void, deps: unknown[]) => {
      const effectRef = React.useRef(effect);
      effectRef.current = effect;
      const dependency = deps[0];
      React.useEffect(() => effectRef.current(), [dependency]);
    }
  };
});

vi.mock('@fastgpt/web/hooks/useSystem', () => ({
  useSystem: () => ({ isMac: false })
}));

vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: () => null
}));

vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));

vi.mock('@/web/core/workflow/editor/session/workflowSession', () => ({
  useWorkflowOverlayActions: () => mocks.patchViewData
}));

vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/useWorkflowDocument',
  () => ({
    useWorkflowSnapshotGetter: () => mocks.getWorkflow
  })
);

vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/workflowCanvasContext', () => ({
  useWorkflowCanvasRendererValue: (selector: (value: unknown) => unknown) =>
    selector({ getNodes: mocks.getNodes, selectNodes: mocks.selectNodes }),
  useWorkflowCanvasValue: (selector: (value: unknown) => unknown) =>
    selector({ getNodeDimension: mocks.getNodeDimension })
}));

vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/nodeDimensions', () => ({
  getDimensionedNodes: (nodes: unknown[]) => nodes
}));

import SearchButton from '@/pageComponents/app/detail/Workflow/components/SearchButton';

describe('SearchButton', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getWorkflow.mockReturnValue({
      nodes: [
        { nodeId: 'alpha-1', name: 'Alpha one' },
        { nodeId: 'alpha-2', name: 'Alpha two' }
      ]
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('clears count and fit state when a new keyword has no matches', async () => {
    await act(async () => {
      root.render(React.createElement(SearchButton));
    });
    await act(async () => undefined);

    await act(async () => {
      container
        .querySelector('button')
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await act(async () => undefined);

    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      Simulate.change(input, { target: { value: 'alpha' } });
    });
    await act(async () => undefined);
    expect(container.textContent).toContain('1 / 2');

    await act(async () => {
      Simulate.change(input, { target: { value: 'missing' } });
    });
    await act(async () => undefined);

    expect(container.textContent).toContain('workflow:no_match_node');
    expect(container.textContent).not.toContain('1 / 2');
    expect(mocks.patchViewData).toHaveBeenLastCalledWith([
      { nodeId: 'alpha-1', values: { searchedText: undefined } },
      { nodeId: 'alpha-2', values: { searchedText: undefined } }
    ]);
  });
});
