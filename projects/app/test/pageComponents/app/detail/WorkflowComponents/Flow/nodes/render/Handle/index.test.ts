import { act, createElement, useLayoutEffect, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as reactFlow from 'reactflow';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  MySourceHandle,
  MyTargetHandle
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle';
import { useNodeHandleLayout } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/useNodeHandleLayout';
import {
  ConnectionSourceHandle,
  ConnectionTargetHandle
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ConnectionHandle';
import {
  ToolSourceHandle,
  ToolTargetHandle
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ToolHandle';
import {
  WorkflowBufferDataContext,
  WorkflowNodeDataContext
} from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { WorkflowUIContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowUIContext';

vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    WorkflowBufferDataContext: createContext({}),
    WorkflowNodeDataContext: createContext({})
  };
});
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext',
  async () => {
    const { createContext } = await import('use-context-selector');
    return { WorkflowActionsContext: createContext({}) };
  }
);
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowUIContext', async () => {
  const { createContext } = await import('use-context-selector');
  return { WorkflowUIContext: createContext({}) };
});
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children, style }: { children?: ReactNode; style?: React.CSSProperties }) =>
    createElement('div', { style }, children),
  Flex: ({ children }: { children?: ReactNode }) => children
}));

describe('workflow handles with real ReactFlow measurements', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;
  let frames: FrameRequestCallback[];
  let store: ReturnType<typeof reactFlow.useStoreApi>;
  let node: FlowNodeItemType;
  let connectingEdge: ComponentProps<
    typeof WorkflowActionsContext.Provider
  >['value']['connectingEdge'];
  let hoverNodeId: string | undefined;
  const sourceId = getHandleId('node', 'source', 'right');
  const targetId = getHandleId('node', 'target', 'left');

  const CaptureStore = ({ children }: { children: ReactNode }) => {
    const currentStore = reactFlow.useStoreApi();
    useNodeHandleLayout({ node, toolConnected: false, language: 'en' });
    useLayoutEffect(() => {
      store = currentStore;
    }, [currentStore]);
    return createElement(
      'div',
      { className: 'react-flow__viewport' },
      createElement('div', { className: 'react-flow__node', 'data-id': 'node' }, children)
    );
  };
  const render = async (
    handles: ReactNode,
    graph?: Pick<
      ComponentProps<typeof WorkflowBufferDataContext.Provider>['value'],
      'getNodeById' | 'edges'
    >
  ) => {
    const children = createElement(CaptureStore, { children: handles }); // eslint-disable-line react/no-children-prop -- 测试 Harness 的 children 是必填属性。
    // 测试使用真实 Context 更新，确保 memo 端口在连接态切换时保留同一个 DOM。
    /* eslint-disable react/no-children-prop */
    await act(async () =>
      root.render(
        createElement(reactFlow.ReactFlowProvider, {
          children: createElement(WorkflowBufferDataContext.Provider, {
            value: {
              getNodeById: () => node,
              edges: [
                {
                  id: 'edge',
                  source: 'node',
                  sourceHandle: sourceId,
                  target: 'target',
                  targetHandle: targetId
                }
              ],
              ...graph
            } as unknown as ComponentProps<typeof WorkflowBufferDataContext.Provider>['value'],
            children: createElement(WorkflowActionsContext.Provider, {
              value: { connectingEdge } as ComponentProps<
                typeof WorkflowActionsContext.Provider
              >['value'],
              children: createElement(WorkflowNodeDataContext.Provider, {
                value: { selectedNodesMap: {} } as ComponentProps<
                  typeof WorkflowNodeDataContext.Provider
                >['value'],
                children: createElement(WorkflowUIContext.Provider, {
                  value: { hoverNodeId } as ComponentProps<
                    typeof WorkflowUIContext.Provider
                  >['value'],
                  children
                })
              })
            })
          })
        })
      )
    );
    /* eslint-enable react/no-children-prop */
  };
  const bounds = () =>
    store.getState().nodeInternals.get('node')?.[reactFlow.internalsSymbol]?.handleBounds;
  const measure = () =>
    store.getState().updateNodeDimensions([
      {
        id: 'node',
        nodeElement: container.querySelector<HTMLDivElement>('.react-flow__node')!,
        forceUpdate: true
      }
    ]);
  const geometry = () =>
    Array.from(container.querySelectorAll<HTMLElement>('.react-flow__handle')).map((handle) => [
      handle.dataset.handleid,
      handle.style.width,
      handle.style.height,
      handle.style.top,
      handle.style.bottom,
      handle.style.transform
    ]);

  beforeEach(() => {
    frames = [];
    node = {
      id: 'node',
      nodeId: 'node',
      name: 'Node',
      intro: '',
      avatar: '',
      flowNodeType: FlowNodeTypeEnum.toolCall,
      showSourceHandle: true,
      inputs: [],
      outputs: []
    };
    connectingEdge = undefined;
    hoverNodeId = undefined;
    dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback)
    );
    Object.defineProperty(dom.window, 'DOMMatrixReadOnly', {
      value: class {
        m22 = 1;
      }
    });
    vi.spyOn(dom.window.HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return Number.parseFloat(this.style.width) || 100;
    });
    vi.spyOn(dom.window.HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return Number.parseFloat(this.style.height) || 100;
    });
    vi.spyOn(dom.window.HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new dom.window.DOMRect(0, 0, 100, 100)
    );
    container = document.querySelector<HTMLDivElement>('#root')!;
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retains ordinary handles and geometry throughout hover, normal dragging and tool dragging', async () => {
    const handles = [
      createElement(ConnectionSourceHandle, { key: 'source', nodeId: 'node' }),
      createElement(MyTargetHandle, {
        key: 'target',
        nodeId: 'node',
        handleId: targetId,
        position: reactFlow.Position.Left,
        translate: [-4, 0],
        showHandle: true
      }),
      createElement(ToolSourceHandle, { key: 'tool-source', nodeId: 'node' }),
      createElement(ToolTargetHandle, { key: 'tool-target', nodeId: 'node', show: true })
    ];
    await render(handles);
    store.setState({ domNode: container });
    store.getState().setNodes([{ id: 'node', position: { x: 0, y: 0 }, data: {} }]);
    measure();
    const initial = geometry();
    const sourceElement = container.querySelector('.react-flow__handle.source');
    const initialBounds = bounds();
    expect(initialBounds?.source).toHaveLength(2);
    expect(initialBounds?.target).toHaveLength(2);
    for (const connection of [
      undefined,
      { nodeId: 'other', handleId: 'ordinary' },
      { nodeId: 'other', handleId: NodeOutputKeyEnum.selectedTools },
      { nodeId: 'node', handleId: NodeOutputKeyEnum.selectedTools },
      undefined
    ]) {
      hoverNodeId = 'node';
      connectingEdge = connection ? { ...connection, handleType: 'source' } : undefined;
      // 覆盖已经排队的 RF 测量，以及 ResizeObserver 直接写缓存的路径。
      const refresh = store.getState().updateNodeDimensions;
      requestAnimationFrame(() =>
        refresh([
          {
            id: 'node',
            nodeElement: container.querySelector<HTMLDivElement>('.react-flow__node')!,
            forceUpdate: true
          }
        ])
      );
      await render(handles);
      await act(async () => {
        frames.splice(0).forEach((callback) => callback(0));
        measure();
      });
      if (connection?.nodeId === 'node') {
        expect(
          container
            .querySelector('.react-flow__handle.target[data-handlepos="top"]')
            ?.classList.contains('connectableend')
        ).toBe(false);
      }
      expect(geometry()).toEqual(initial);
      expect(bounds()).toEqual(initialBounds);
      expect(container.querySelector('.react-flow__handle.source')).toBe(sourceElement);
    }
    expect(
      container
        .querySelector('.react-flow__handle.target[data-handlepos="top"]')
        ?.classList.contains('connectableend')
    ).toBe(false);
  });

  it.each([
    ['tool-root', 'main-tail', false],
    ['main', 'tool-tail', false],
    ['tool-root', 'other-tail', false],
    ['other-tool', 'tool-tail', false],
    ['tool-root', 'tool-tail', true],
    ['main', 'main-tail', true],
    ['main-mid', 'main', false],
    ['main-tail', 'main', false],
    ['tool-tail', 'tool-mid', false],
    ['main-tail', 'main', true, 'main-mid'],
    ['main-tail', 'main-mid', true, 'main-mid'],
    ['main-mid', 'main', true, 'main-mid'],
    ['main-tail', 'main-mid', false, 'main'],
    ['main-tail', 'main', true, 'main-mid', 'catch'],
    ['main-tail', 'main-mid', true, 'main-tail', 'catch'],
    ['tool-tail', 'tool-mid', true, 'tool-tail', 'catch'],
    ['main-tail', 'tool-mid', false, 'main-tail', 'catch'],
    ['main-tail', 'main', true, 'main-mid', 'success'],
    ['main-tail', 'main-mid', true, 'main-tail', 'success'],
    ['tool-tail', 'tool-mid', true, 'tool-tail', 'success'],
    ['main-tail', 'tool-mid', false, 'main-tail', 'success']
  ])(
    'shows only eligible target handles while dragging %s -> %s',
    async (source, target, allowed, branchId = '', errorPort = '') => {
      node = { ...node, flowNodeType: FlowNodeTypeEnum.chatNode, showTargetHandle: true };
      const nodeId = (id: string) => (id === target ? 'node' : id);
      const edges = [
        ['start', 'caller'],
        ['caller', 'main'],
        ['main', 'main-mid'],
        ['main-mid', 'main-tail'],
        ['caller', 'tool-root', NodeOutputKeyEnum.selectedTools],
        ['tool-root', 'tool-mid'],
        ['tool-mid', 'tool-tail'],
        ['caller', 'other-tool', NodeOutputKeyEnum.selectedTools],
        ['other-tool', 'other-tail']
      ].map(([source, target, targetHandle], index) => ({
        id: String(index),
        source: nodeId(source),
        target: nodeId(target),
        sourceHandle: targetHandle ?? getHandleId(nodeId(source), 'source', 'right'),
        targetHandle: targetHandle ?? getHandleId(nodeId(target), 'target', 'left')
      }));
      const nodes = new Map(
        [...new Set(edges.flatMap((edge) => [edge.source, edge.target]))].map((id) => [
          id,
          {
            ...node,
            nodeId: id,
            flowNodeType:
              id === 'start' ? FlowNodeTypeEnum.workflowStart : FlowNodeTypeEnum.chatNode
          }
        ])
      );
      if (branchId) {
        const branch = nodeId(branchId);
        if (errorPort) nodes.get(branch)!.catchError = true;
        else nodes.get(branch)!.flowNodeType = FlowNodeTypeEnum.ifElseNode;
        for (const edge of edges)
          if (edge.source === branch)
            edge.sourceHandle = getHandleId(
              branch,
              errorPort === 'catch' ? 'source_catch' : 'source',
              errorPort ? 'right' : 'ELSE'
            );
      }
      const graph = {
        edges,
        getNodeById: (id: string | null | undefined) => (id ? nodes.get(id) : undefined)
      };
      const before = structuredClone(edges);
      const handle = createElement(ConnectionTargetHandle, { nodeId: 'node' });
      await render(handle, graph);
      store.setState({ domNode: container });
      store.getState().setNodes([{ id: 'node', position: { x: 0, y: 0 }, data: {} }]);
      measure();
      const element = container.querySelector<HTMLElement>('.react-flow__handle.target')!;
      const initialBounds = bounds();
      expect(element.style.visibility).toBe('visible');

      connectingEdge = {
        nodeId: source,
        handleId:
          source === branchId
            ? getHandleId(
                source,
                errorPort === 'catch' ? 'source_catch' : 'source',
                errorPort ? 'right' : 'ELSE'
              )
            : getHandleId(source, 'source', 'right'),
        handleType: 'source'
      };
      await render(handle, graph);
      measure();
      expect(element.style.visibility).toBe(allowed ? 'visible' : 'hidden');
      expect(element.classList.contains('connectableend')).toBe(allowed);
      // 隐藏不可连接的入口只改变展示和交互，不卸载端口或影响已有连线的测量缓存。
      expect(container.querySelector('.react-flow__handle.target')).toBe(element);
      expect(bounds()).toEqual(initialBounds);
      expect(edges).toEqual(before);

      connectingEdge = undefined;
      await render(handle, graph);
      expect(element.style.visibility).toBe('visible');
    }
  );

  it.each([
    ['normal-input', 'caller', NodeOutputKeyEnum.selectedTools, false],
    ['tool-input', 'caller', NodeOutputKeyEnum.selectedTools, false],
    ['tool-input', 'other-caller', NodeOutputKeyEnum.selectedTools, false],
    ['no-input', 'caller', NodeOutputKeyEnum.selectedTools, true],
    ['tool-input', 'other-caller', 'ordinary', false],
    ['tool-input', 'node', NodeOutputKeyEnum.selectedTools, false]
  ] as const)(
    'uses Core eligibility to hide tool handles for %s from %s via %s',
    async (incoming, source, sourceHandle, allowed) => {
      node = { ...node, flowNodeType: FlowNodeTypeEnum.chatNode, isTool: true };
      const caller = { ...node, nodeId: 'caller', flowNodeType: FlowNodeTypeEnum.toolCall };
      const other = { ...caller, nodeId: 'other-caller' };
      const edges =
        incoming === 'no-input'
          ? []
          : [
              {
                id: 'incoming',
                source: 'caller',
                target: 'node',
                sourceHandle:
                  incoming === 'tool-input'
                    ? NodeOutputKeyEnum.selectedTools
                    : 'caller-source-right',
                targetHandle: incoming === 'tool-input' ? NodeOutputKeyEnum.selectedTools : targetId
              }
            ];
      const graph = {
        edges,
        getNodeById: (id: string | null | undefined) =>
          [node, caller, other].find((node) => node.nodeId === id)
      };
      const handle = createElement(ToolTargetHandle, { nodeId: 'node', show: true });
      await render(handle, graph);
      store.setState({ domNode: container });
      store.getState().setNodes([{ id: 'node', position: { x: 0, y: 0 }, data: {} }]);
      measure();
      const element = container.querySelector<HTMLElement>('.react-flow__handle.target')!;
      const initialBounds = bounds();
      connectingEdge = {
        nodeId: source,
        handleId: sourceHandle === 'ordinary' ? `${source}-source-right` : sourceHandle,
        handleType: 'source'
      };
      await render(handle, graph);
      measure();
      expect(element.style.visibility).toBe(allowed ? '' : 'hidden');
      expect(element.classList.contains('connectableend')).toBe(allowed);
      expect(container.querySelector('.react-flow__handle.target')).toBe(element);
      expect(bounds()).toEqual(initialBounds);
      expect(edges).toHaveLength(incoming === 'no-input' ? 0 : 1);
      connectingEdge = undefined;
      await render(handle, graph);
      expect(element.style.visibility).toBe(incoming === 'tool-input' ? '' : 'hidden');
    }
  );

  it('keeps all folded branch IDs and catch IDs available to the actual ReactFlow cache', async () => {
    node = {
      ...node,
      flowNodeType: FlowNodeTypeEnum.ifElseNode,
      showSourceHandle: false,
      isFolded: true,
      catchError: true,
      inputs: [
        {
          key: NodeInputKeyEnum.ifElseList,
          label: '',
          renderTypeList: [],
          value: [{ branchId: 'a' }, { branchId: 'b' }]
        }
      ]
    };
    await render(createElement(ConnectionSourceHandle, { nodeId: 'node' }));
    store.setState({ domNode: container });
    store.getState().setNodes([{ id: 'node', position: { x: 0, y: 0 }, data: {} }]);
    measure();
    expect(bounds()?.source?.map((handle) => handle.id)).toEqual([
      getHandleId('node', 'source', 'a'),
      getHandleId('node', 'source', 'b'),
      getHandleId('node', 'source', 'ELSE'),
      getHandleId('node', 'source_catch', 'right')
    ]);
    expect(
      container.querySelectorAll('.react-flow__handle.source[style*="visibility: visible"]')
    ).toHaveLength(0);
  });

  it('refreshes reordered, replaced and removed ports from committed configuration without resizing', async () => {
    const handles = (keys: string[]) =>
      keys.map((key) =>
        createElement(MySourceHandle, {
          key,
          nodeId: 'node',
          handleId: getHandleId('node', 'source', key),
          position: reactFlow.Position.Right
        })
      );
    await render(handles(['a', 'b']));
    store.setState({ domNode: container });
    store.getState().setNodes([{ id: 'node', position: { x: 0, y: 0 }, data: {} }]);
    measure();
    for (const keys of [['b', 'a'], ['new', 'b'], ['b'], []]) {
      node = {
        ...node,
        inputs: [
          {
            key: NodeInputKeyEnum.userSelectOptions,
            label: '',
            renderTypeList: [],
            value: keys.map((key) => ({ key }))
          }
        ]
      };
      await render(handles(keys));
      await act(async () => frames.splice(0).forEach((callback) => callback(0)));
      expect(bounds()?.source?.map((handle) => handle.id) ?? []).toEqual(
        keys.map((key) => getHandleId('node', 'source', key))
      );
    }
  });
});
