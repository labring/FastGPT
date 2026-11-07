import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import IOTitle from '@/pageComponents/app/detail/WorkflowComponents/Flow/components/IOTitle';

const mocks = vi.hoisted(() => ({
  onChangeNode: vi.fn(),
  onDelEdge: vi.fn(),
  onToggle: undefined as undefined | ((event: { target: { checked: boolean } }) => void)
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, selector: (value: typeof mocks) => unknown) =>
    selector(mocks)
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext', () => ({
  WorkflowActionsContext: {}
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/components/ToolParamConfig', () => ({
  default: () => null
}));
vi.mock('@chakra-ui/react', () => {
  const Box = ({ children }: { children?: ReactNode }) => children;
  return {
    Box,
    HStack: Box,
    Text: Box,
    Switch: ({ onChange }: { onChange: typeof mocks.onToggle }) => {
      mocks.onToggle = onChange;
      return null;
    }
  };
});

describe('IOTitle catch port deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onToggle = undefined;
  });

  it('deletes all attached catch edges only when explicitly disabling the port', () => {
    renderToStaticMarkup(createElement(IOTitle, { nodeId: 'node', catchError: true }));
    mocks.onToggle?.({ target: { checked: false } });
    expect(mocks.onDelEdge).toHaveBeenCalledExactlyOnceWith({
      nodeId: 'node',
      sourceHandle: getHandleId('node', 'source_catch', 'right')
    });
    expect(mocks.onChangeNode).toHaveBeenCalledExactlyOnceWith({
      nodeId: 'node',
      type: 'attr',
      key: 'catchError',
      value: false
    });
    mocks.onDelEdge.mockClear();
    mocks.onToggle?.({ target: { checked: true } });
    expect(mocks.onDelEdge).not.toHaveBeenCalled();
  });

  it('does nothing without a node ID', () => {
    renderToStaticMarkup(createElement(IOTitle, { catchError: true }));
    mocks.onToggle?.({ target: { checked: false } });
    expect(mocks.onDelEdge).not.toHaveBeenCalled();
    expect(mocks.onChangeNode).not.toHaveBeenCalled();
  });
});
