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
import { ConnectionSourceHandle } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ConnectionHandle';
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
  const render = async (handles: ReactNode) => {
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
              ]
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
