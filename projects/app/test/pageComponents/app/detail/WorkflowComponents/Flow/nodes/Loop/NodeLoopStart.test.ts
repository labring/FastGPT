import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { LoopStartNode } from '@fastgpt/global/core/workflow/template/system/loop/loopStart';
import NodeLoopStart from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/NodeLoopStart';

const mocks = vi.hoisted(() => ({
  parentInputs: undefined as unknown,
  outputs: [] as Array<Record<string, unknown>>,
  updateNode: vi.fn(),
  getEdges: vi.fn(() => [])
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (value: string) => value })
}));

vi.mock('@chakra-ui/react', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => children;
  return {
    Box: Passthrough,
    Flex: Passthrough,
    Table: Passthrough,
    Tbody: Passthrough,
    Td: Passthrough,
    Th: Passthrough,
    Thead: Passthrough,
    Tr: Passthrough
  };
});

vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableContainer: ({ children }: { children?: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard', () => ({
  default: ({ children }: { children?: React.ReactNode }) => children
}));
vi.mock('@/web/core/workflow/utils', () => ({
  getOutputDisconnectCommands: () => []
}));
vi.mock('@/web/core/workflow/editor/react/useNode', () => ({
  useNode: (nodeId: string, selector: (node: unknown) => unknown) => {
    const node =
      nodeId === 'child'
        ? { data: { outputs: mocks.outputs } }
        : nodeId === 'parent' && mocks.parentInputs
          ? { data: { inputs: mocks.parentInputs } }
          : undefined;
    return selector(node);
  },
  useNodeActions: () => ({ updateNode: mocks.updateNode })
}));
vi.mock('@/web/core/workflow/editor/react/useWorkflow', () => ({
  useWorkflowActions: () => ({ getEdges: mocks.getEdges })
}));

describe('NodeLoopStart history initialization', () => {
  let root: Root;
  let container: HTMLDivElement;

  const render = async () => {
    await act(async () =>
      root.render(
        React.createElement(NodeLoopStart, {
          data: { nodeId: 'child', parentNodeId: 'parent' },
          selected: false
        } as any)
      )
    );
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.parentInputs = undefined;
    mocks.outputs = LoopStartNode.outputs.map((output) => ({ ...output }));
    mocks.updateNode.mockReset();
    mocks.getEdges.mockClear();
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

  it('does not write history while the parent node is not readable', async () => {
    await render();

    expect(mocks.updateNode).not.toHaveBeenCalled();
  });

  it('keeps the neutral output until the parent array type changes', async () => {
    await render();

    mocks.parentInputs = [
      { key: NodeInputKeyEnum.nestedInputArray, valueType: WorkflowIOValueTypeEnum.arrayAny }
    ];
    await render();
    expect(mocks.updateNode).not.toHaveBeenCalled();

    mocks.parentInputs = [
      { key: NodeInputKeyEnum.nestedInputArray, valueType: WorkflowIOValueTypeEnum.arrayString }
    ];
    await render();
    expect(mocks.updateNode).toHaveBeenCalledOnce();
  });
});
