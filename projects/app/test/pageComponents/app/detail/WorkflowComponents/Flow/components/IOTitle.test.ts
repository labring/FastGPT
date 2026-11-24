import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import IOTitle from '@/pageComponents/app/detail/WorkflowComponents/Flow/components/IOTitle';

const mocks = vi.hoisted(() => ({
  updateNode: vi.fn(),
  getEdges: vi.fn(),
  outputs: [] as Array<{ type: FlowNodeOutputTypeEnum }>,
  onToggle: undefined as undefined | ((event: { target: { checked: boolean } }) => void)
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/web/core/workflow/editor/react/useWorkflow', () => ({
  useWorkflowActions: () => ({ getEdges: mocks.getEdges })
}));
vi.mock('@/web/core/workflow/editor/react/useNode', () => ({
  useNode: (
    _nodeId: string,
    selector: (node: { data: { outputs: typeof mocks.outputs } }) => unknown
  ) => selector({ data: { outputs: mocks.outputs } }),
  useNodeActions: () => ({ updateNode: mocks.updateNode })
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
    mocks.getEdges.mockReturnValue([]);
    mocks.outputs = [{ type: FlowNodeOutputTypeEnum.error }];
  });

  it('deletes all attached catch edges only when explicitly disabling the port', () => {
    const sourceHandle = getHandleId('node', 'source_catch', 'right');
    const attachedEdges = [
      {
        source: 'node',
        target: 'first-target',
        sourceHandle,
        targetHandle: 'first-target-left'
      },
      {
        source: 'node',
        target: 'second-target',
        sourceHandle,
        targetHandle: 'second-target-left'
      }
    ];
    mocks.getEdges.mockReturnValue([
      ...attachedEdges,
      {
        source: 'node',
        target: 'normal-target',
        sourceHandle: 'source-right',
        targetHandle: 'normal-target-left'
      },
      {
        source: 'other-node',
        target: 'node',
        sourceHandle: 'other-right',
        targetHandle: sourceHandle
      }
    ]);
    renderToStaticMarkup(createElement(IOTitle, { nodeId: 'node', catchError: true }));
    mocks.onToggle?.({ target: { checked: false } });
    const disableCall = mocks.updateNode.mock.calls[0];
    expect(disableCall[0]()).toEqual({ catchError: false });
    expect(disableCall[1]).toEqual({
      disconnectEdges: attachedEdges.map((edge) => ({ edge }))
    });
    mocks.onToggle?.({ target: { checked: true } });
    const enableCall = mocks.updateNode.mock.calls[1];
    expect(enableCall[0]()).toEqual({ catchError: true });
    expect(enableCall[1]).toEqual({ disconnectEdges: [] });
  });

  it('does nothing without a node ID', () => {
    renderToStaticMarkup(createElement(IOTitle, { catchError: true }));
    mocks.onToggle?.({ target: { checked: false } });
    expect(mocks.getEdges).not.toHaveBeenCalled();
    expect(mocks.updateNode).not.toHaveBeenCalled();
  });

  it('hides catch switching when the node has no error output', () => {
    mocks.outputs = [{ type: FlowNodeOutputTypeEnum.static }];
    renderToStaticMarkup(createElement(IOTitle, { nodeId: 'node', catchError: false }));
    expect(mocks.onToggle).toBeUndefined();
  });

  it('shows catch switching when the node has an error output', () => {
    renderToStaticMarkup(createElement(IOTitle, { nodeId: 'node', catchError: false }));
    expect(mocks.onToggle).toBeTypeOf('function');
  });
});
