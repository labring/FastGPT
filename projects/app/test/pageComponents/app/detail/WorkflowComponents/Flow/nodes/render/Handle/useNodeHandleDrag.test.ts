import { act, createElement, useLayoutEffect, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as reactFlow from '@xyflow/react';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeShellSourceHandles } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ConnectionHandle';
import { useNodeHandleDrag } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/useNodeHandleDrag';
import { getNodeShellHandleModel } from '@/pageComponents/app/detail/WorkflowComponents/Flow/utils/nodeHandle';

const mocks = vi.hoisted((): { connectingEdge?: { nodeId: string } } => ({}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/canvasState', () => ({
  useWorkflowUIValue: (select: (state: unknown) => unknown) =>
    select({ connectingEdge: mocks.connectingEdge })
}));
vi.mock('@/web/core/workflow/editor/react/useNode', () => ({
  useNode: (_nodeId: string, select: (node: unknown) => unknown) =>
    select({ data: { flowNodeType: FlowNodeTypeEnum.chatNode } })
}));
vi.mock('@/web/core/workflow/editor/react/useWorkflow', () => ({
  useWorkflow: (select: (structure: unknown, graph: unknown) => unknown) =>
    select(
      {},
      { isHandleConnected: ({ direction }: { direction: string }) => direction === 'source' }
    )
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/context/workflowSelectionContext',
  () => ({
    useWorkflowSelectionValue: (select: (state: unknown) => unknown) =>
      select({ selectedNodesMap: {} })
  })
);

describe('useNodeHandleDrag', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;
  let store: ReturnType<typeof reactFlow.useStoreApi>;
  let updateNodeInternals: ReturnType<typeof reactFlow.useUpdateNodeInternals>;
  let internalNode: ReturnType<typeof reactFlow.useInternalNode>;
  let drag: ReturnType<typeof useNodeHandleDrag>;
  let frames: FrameRequestCallback[];
  const handleId = getHandleId('node', 'source', 'branch');

  type ShellProps = ComponentProps<typeof NodeShellSourceHandles>;
  const Harness = ({ cloned = false, shell }: { cloned?: boolean; shell?: ShellProps }) => {
    const currentStore = reactFlow.useStoreApi();
    const currentUpdateNodeInternals = reactFlow.useUpdateNodeInternals();
    internalNode = reactFlow.useInternalNode('node');
    drag = useNodeHandleDrag('node');
    useLayoutEffect(() => {
      store = currentStore;
      updateNodeInternals = currentUpdateNodeInternals;
    }, [currentStore, currentUpdateNodeInternals]);
    return createElement(
      'div',
      { className: 'react-flow__viewport xyflow__viewport' },
      createElement(
        'div',
        { className: 'react-flow__node', 'data-id': 'node' },
        shell
          ? createElement(ChakraProvider, null, createElement(NodeShellSourceHandles, shell))
          : !cloned &&
              createElement(reactFlow.Handle, {
                id: handleId,
                type: 'source',
                position: reactFlow.Position.Right,
                style: { width: 24, height: 24 }
              }),
        drag.draggingHandle
      )
    );
  };
  const render = async (cloned = false, shell?: ShellProps) => {
    await act(async () =>
      root.render(
        createElement(reactFlow.ReactFlowProvider, null, createElement(Harness, { cloned, shell }))
      )
    );
  };
  const measure = async () => {
    await act(async () => {
      updateNodeInternals('node');
      frames.splice(0).forEach((callback) => callback(0));
    });
  };
  const bounds = () => internalNode?.internals.handleBounds?.source;

  beforeEach(async () => {
    frames = [];
    mocks.connectingEdge = undefined;
    dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback)
    );
    Object.defineProperty(dom.window, 'DOMMatrixReadOnly', {
      value: class {
        m22 = 2;
      }
    });
    vi.spyOn(dom.window.HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return Number.parseFloat(this.style.width) || 300;
    });
    vi.spyOn(dom.window.HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return Number.parseFloat(this.style.height) || 200;
    });
    vi.spyOn(dom.window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.classList.contains('react-flow__handle')) {
          // JSDOM 无布局，按真实 shell 元素的 CSS anchor 模拟 2 倍缩放后的端口位置。
          const anchorTop =
            this.dataset.workflowSourceHandleId && this.parentElement
              ? dom.window.getComputedStyle(this.parentElement).top
              : '';
          const top = anchorTop
            ? (anchorTop.endsWith('%')
                ? (Number.parseFloat(anchorTop) / 100) * 200
                : Number.parseFloat(anchorTop)) - 12
            : Number.parseFloat(this.style.top) || 40;
          return new dom.window.DOMRect(
            100 + (Number.parseFloat(this.style.left) || 200) * 2,
            200 + top * 2,
            48,
            48
          );
        }
        return new dom.window.DOMRect(100, 200, 600, 400);
      }
    );
    container = document.querySelector<HTMLDivElement>('#root')!;
    root = createRoot(container);
    await render();
    await act(async () => {
      store.setState({ domNode: container, transform: [0, 0, 2] });
      store.getState().setNodes([{ id: 'node', position: { x: 0, y: 0 }, data: {} }]);
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['drop', 'cancel'] as const)(
    'keeps the dragged port in its node until %s, then returns it to the real row',
    async () => {
      await measure();
      const initial = bounds();
      expect(initial?.map((handle) => handle.id)).toEqual([handleId]);
      await act(async () => drag.onBeforeCapture({ draggableId: 'branch' }));
      await render(true);
      const handle = container.querySelector<HTMLElement>('.react-flow__handle')!;
      expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(1);
      expect(handle.dataset.handleid).toBe(handleId);
      expect(handle.style.left).toBe('200px');
      expect(handle.style.top).toBe('40px');
      expect(handle.style.width).toBe('24px');
      expect(handle.style.visibility).toBe('hidden');
      await measure();
      expect(bounds()).toEqual(initial);

      await act(async () => {
        drag.onDragEnd();
        root.render(createElement(reactFlow.ReactFlowProvider, null, createElement(Harness)));
      });
      await act(async () => frames.splice(0).forEach((callback) => callback(0)));
      expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(1);
      expect(container.querySelector<HTMLElement>('.react-flow__handle')!.style.visibility).toBe(
        ''
      );
      expect(bounds()).toEqual(initial);
    }
  );

  it('does not create a placeholder for an unknown port or another canvas', async () => {
    await act(async () => drag.onBeforeCapture({ draggableId: 'missing' }));
    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(1);
    store.setState({ domNode: null });
    await act(async () => drag.onBeforeCapture({ draggableId: 'branch' }));
    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(1);
  });

  it('keeps every folded branch in the actual React Flow handle bounds', async () => {
    const ids = ['if', 'elseif', 'ELSE'].map((branchId) => getHandleId('node', 'source', branchId));
    const props = {
      nodeId: 'node',
      model: getNodeShellHandleModel({
        nodeId: 'node',
        flowNodeType: FlowNodeTypeEnum.ifElseNode,
        inputs: [
          { key: NodeInputKeyEnum.ifElseList, value: [{ branchId: 'if' }, { branchId: 'elseif' }] }
        ],
        outputs: []
      }),
      isFolded: true,
      centers: new Map(ids.map((id, index) => [id, { x: 300, y: 40 + 40 * index }]))
    };
    await render(false, props);
    await measure();

    const handles = [...container.querySelectorAll<HTMLElement>('.react-flow__handle.source')];
    expect(handles.map((handle) => handle.dataset.handleid)).toEqual(ids);
    expect(bounds()?.map(({ id }) => id)).toEqual(ids);
    expect(bounds()?.map(({ y }) => y)).toEqual([88, 88, 88]);
    expect(handles.map((handle) => handle.style.visibility)).toEqual([
      'visible',
      'hidden',
      'hidden'
    ]);

    await render(false, { ...props, isFolded: false });
    await measure();
    expect(bounds()?.map(({ y }) => y)).toEqual([28, 68, 108]);
  });

  it('retains the normal folded source exactly once alongside named sources', async () => {
    await render(false, {
      nodeId: 'node',
      model: getNodeShellHandleModel({
        nodeId: 'node',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        showSourceHandle: true,
        inputs: [],
        outputs: [
          { key: 'right', type: FlowNodeOutputTypeEnum.source, label: 'Source' },
          { key: 'named', type: FlowNodeOutputTypeEnum.source, label: 'Named source' }
        ]
      }),
      isFolded: true
    });
    await measure();

    expect(bounds()?.map(({ id }) => id)).toEqual(['node-source-right', 'node-source-named']);
  });

  it('measures the normal source when its shell mounts during another connection', async () => {
    mocks.connectingEdge = { nodeId: 'other-node' };
    await render(false, {
      nodeId: 'node',
      model: getNodeShellHandleModel({
        nodeId: 'node',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        showSourceHandle: true,
        inputs: [],
        outputs: []
      }),
      isFolded: false
    });
    await measure();

    expect(bounds()?.map(({ id }) => id)).toEqual(['node-source-right']);
    expect(
      container.querySelector<HTMLElement>('[data-handleid="node-source-right"]')?.style.visibility
    ).toBe('hidden');
  });
});
