import { act, createElement, Fragment, StrictMode, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHandleInternals } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/useHandleInternals';

const mocks = vi.hoisted(() => ({ updateNodeInternals: vi.fn() }));
vi.mock('reactflow', () => ({ useUpdateNodeInternals: () => mocks.updateNodeInternals }));

/** 保留 ReactFlow 实际输出的端口 DOM，只有测量入口被替换，DOM 变更监听使用真实实现。 */
const TestHandle = ({
  nodeId,
  handleId,
  isConnecting = false
}: {
  nodeId: string;
  handleId: string;
  isConnecting?: boolean;
}) => {
  const ref = useHandleInternals(nodeId, isConnecting);
  return createElement('div', {
    ref,
    className: 'react-flow__handle source',
    'data-id': `${nodeId}-${handleId}-source`,
    'data-handleid': handleId,
    'data-handlepos': 'right'
  });
};

const TestNode = ({
  nodeId = 'node',
  handles = ['a', 'b'],
  showNote = false,
  showSpacer = false,
  isConnecting = false
}: {
  nodeId?: string;
  handles?: string[];
  showNote?: boolean;
  showSpacer?: boolean;
  isConnecting?: boolean;
}) =>
  createElement(
    'div',
    { className: 'react-flow__node', 'data-id': nodeId },
    showSpacer && createElement('span', { 'data-spacer': '' }),
    handles.map((handleId) =>
      createElement(TestHandle, { key: handleId, nodeId, handleId, isConnecting })
    ),
    showNote && createElement('span', null, 'Updated input description')
  );

describe('useHandleInternals', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;
  let frameId: number;
  let frames: Map<number, FrameRequestCallback>;

  /** 先交付真实 MutationObserver 微任务，再执行一帧，避免用固定 sleep 猜测 DOM 提交时间。 */
  const flushFrame = async () => {
    await act(async () => {
      await Promise.resolve();
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    });
  };
  const render = async (element: ReactNode) => {
    await act(async () => root.render(element));
    await flushFrame();
  };

  beforeEach(() => {
    mocks.updateNodeInternals.mockReset();
    frameId = 0;
    frames = new Map();
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(dom.window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    container = document.querySelector<HTMLDivElement>('#root')!;
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await flushFrame();
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shares one observer and one refresh per frame among handles of the same node', async () => {
    const observe = vi.spyOn(dom.window.MutationObserver.prototype, 'observe');
    await act(async () => root.render(createElement(TestNode)));
    expect(observe).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
    expect(mocks.updateNodeInternals).not.toHaveBeenCalled();

    await flushFrame();
    expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
    await flushFrame();
    expect(mocks.updateNodeInternals).toHaveBeenCalledTimes(1);
  });

  it('refreshes reordered, replaced, added and removed handles without a node resize', async () => {
    await render(createElement(TestNode));
    for (const handles of [['b', 'a'], ['x', 'y'], ['x', 'z'], ['x', 'z', 'd'], ['z']]) {
      mocks.updateNodeInternals.mockClear();
      await render(createElement(TestNode, { handles }));
      expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
    }
  });

  it('merges handle ID, direction and role mutations into one refresh', async () => {
    await render(createElement(TestNode));
    mocks.updateNodeInternals.mockClear();
    const handle = container.querySelector('.react-flow__handle')!;
    handle.setAttribute('data-handleid', 'changed');
    handle.setAttribute('data-handlepos', 'left');
    handle.setAttribute('data-id', 'node-changed-target');
    handle.className = 'react-flow__handle target';

    await flushFrame();
    expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
  });

  it('ignores ordinary content changes and node translations when handle layout stays the same', async () => {
    await render(createElement(TestNode));
    mocks.updateNodeInternals.mockClear();
    await render(createElement(TestNode, { showNote: true }));
    const node = container.querySelector<HTMLElement>('.react-flow__node')!;
    node.style.transform = 'translate(100px, 200px)';
    await flushFrame();
    expect(mocks.updateNodeInternals).not.toHaveBeenCalled();
  });

  it('detects internal handle movement even when IDs, order and node size remain unchanged', async () => {
    vi.spyOn(dom.window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const moved =
          this.classList.contains('react-flow__handle') &&
          !!this.closest('.react-flow__node')?.querySelector('[data-spacer]');
        return new dom.window.DOMRect(0, moved ? 30 : 0, 100, 100);
      }
    );
    await render(createElement(TestNode));
    mocks.updateNodeInternals.mockClear();

    await render(createElement(TestNode, { showSpacer: true }));
    expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
  });

  it('refreshes changed handle styles without measuring unrelated element styles', async () => {
    vi.spyOn(dom.window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return new dom.window.DOMRect(0, Number.parseFloat(this.style.top) || 0, 100, 100);
      }
    );
    await render(createElement(TestNode, { showNote: true }));
    mocks.updateNodeInternals.mockClear();
    const note = container.querySelector<HTMLElement>('span')!;
    note.style.color = 'red';
    await flushFrame();
    expect(mocks.updateNodeInternals).not.toHaveBeenCalled();

    const handle = container.querySelector<HTMLElement>('.react-flow__handle')!;
    handle.style.top = '20px';
    await flushFrame();
    expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
  });

  it('defers handle changes during a connection and refreshes their final layout once', async () => {
    await render(createElement(TestNode));
    mocks.updateNodeInternals.mockClear();

    await render(createElement(TestNode, { isConnecting: true }));
    await render(createElement(TestNode, { isConnecting: true, handles: ['b', 'a', 'c'] }));
    await render(createElement(TestNode, { isConnecting: true, handles: ['c', 'b'] }));
    expect(mocks.updateNodeInternals).not.toHaveBeenCalled();

    await render(createElement(TestNode, { handles: ['c', 'b'] }));
    expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
    await flushFrame();
    expect(mocks.updateNodeInternals).toHaveBeenCalledTimes(1);
  });

  it.each(['pending-frame', 'resize-observer'] as const)(
    'restores real ReactFlow handle bounds after a %s measurement during a connection',
    async (measurement) => {
      const reactFlow = await vi.importActual<typeof import('reactflow')>('reactflow');
      const {
        ReactFlowProvider,
        useStoreApi,
        useUpdateNodeInternals: useRealUpdateNodeInternals
      } = reactFlow;
      const storeRef: { current?: ReturnType<typeof useStoreApi> } = {};

      /** 只透传测量入口，保留 ReactFlow 自身的第二帧调度和端口缓存写入。 */
      const TestFlowNode = (props: Parameters<typeof TestNode>[0]) => {
        const store = useStoreApi();
        const updateNodeInternals = useRealUpdateNodeInternals();
        useLayoutEffect(() => {
          storeRef.current = store;
          mocks.updateNodeInternals.mockImplementation(updateNodeInternals);
        }, [store, updateNodeInternals]);
        return createElement(TestNode, props);
      };
      const createFlow = (props: Parameters<typeof TestNode>[0] = {}) =>
        createElement(
          ReactFlowProvider,
          null,
          createElement(
            'div',
            { className: 'react-flow__viewport' },
            createElement(TestFlowNode, props)
          )
        );

      vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame);
      Object.defineProperty(dom.window, 'DOMMatrixReadOnly', {
        value: class {
          m22 = 1;
        }
      });
      vi.spyOn(dom.window.HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
      vi.spyOn(dom.window.HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
      vi.spyOn(dom.window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
        function (this: HTMLElement) {
          const moved =
            this.classList.contains('react-flow__handle') &&
            !!this.closest('.react-flow__node')?.querySelector('[data-spacer]');
          return new dom.window.DOMRect(0, moved ? 30 : 0, 100, 100);
        }
      );

      await act(async () => root.render(createFlow()));
      const store = storeRef.current;
      if (!store) throw new Error('ReactFlow store is unavailable');
      store.setState({ domNode: container });
      store.getState().setNodes([{ id: 'node', position: { x: 0, y: 0 }, data: {} }]);
      await flushFrame();
      await flushFrame();
      const getSourceHandleIds = () =>
        store
          .getState()
          .nodeInternals.get('node')
          ?.[reactFlow.internalsSymbol]?.handleBounds?.source?.map((handle) => handle.id);
      expect(getSourceHandleIds()).toEqual(['a', 'b']);

      const showSpacer = measurement === 'pending-frame';
      if (showSpacer) {
        // 外层快照已更新，ReactFlow 的实际测量仍在下一帧等待执行。
        await render(createFlow({ showSpacer }));
        expect(frames.size).toBe(1);
      }
      await act(async () =>
        root.render(createFlow({ isConnecting: true, handles: ['b'], showSpacer }))
      );
      if (measurement === 'resize-observer') {
        // 节点 ResizeObserver 直接刷新缓存，也不会经过 Hook 的暂停判断。
        store.getState().updateNodeDimensions([
          {
            id: 'node',
            nodeElement: container.querySelector<HTMLDivElement>('.react-flow__node')!,
            forceUpdate: true
          }
        ]);
      }
      await flushFrame();
      expect(getSourceHandleIds()).toEqual(['b']);
      mocks.updateNodeInternals.mockClear();

      // 恢复后的 DOM 与连线前快照相同，也必须修复被临时测量覆盖的缓存。
      await render(createFlow({ showSpacer }));
      await flushFrame();
      expect(getSourceHandleIds()).toEqual(['a', 'b']);
      expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
      await flushFrame();
      expect(mocks.updateNodeInternals).toHaveBeenCalledTimes(1);
    }
  );

  it('synchronizes the final removal, disconnects its observer and supports adding handles again', async () => {
    const observe = vi.spyOn(dom.window.MutationObserver.prototype, 'observe');
    const disconnect = vi.spyOn(dom.window.MutationObserver.prototype, 'disconnect');
    await render(createElement(TestNode));
    mocks.updateNodeInternals.mockClear();

    await render(createElement(TestNode, { handles: [] }));
    expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
    expect(disconnect).toHaveBeenCalledTimes(1);
    mocks.updateNodeInternals.mockClear();
    await render(createElement(TestNode, { handles: ['new'] }));
    expect(observe).toHaveBeenCalledTimes(2);
    expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
  });

  it('skips pending measurements after the entire node unmounts', async () => {
    const disconnect = vi.spyOn(dom.window.MutationObserver.prototype, 'disconnect');
    await act(async () => root.render(createElement(TestNode)));
    await act(async () => root.render(null));
    expect(disconnect).toHaveBeenCalledTimes(1);
    await flushFrame();

    expect(mocks.updateNodeInternals).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('isolates separate node DOMs that share the same node ID', async () => {
    const observe = vi.spyOn(dom.window.MutationObserver.prototype, 'observe');
    await render(createElement(Fragment, null, createElement(TestNode), createElement(TestNode)));
    expect(observe).toHaveBeenCalledTimes(2);
    expect(mocks.updateNodeInternals).toHaveBeenCalledTimes(2);
    mocks.updateNodeInternals.mockClear();

    await render(
      createElement(
        Fragment,
        null,
        createElement(TestNode),
        createElement(TestNode, { handles: ['b', 'a'] })
      )
    );
    expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
  });

  it('keeps subscriptions working through StrictMode initialization', async () => {
    await render(createElement(StrictMode, null, createElement(TestNode)));
    expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
    mocks.updateNodeInternals.mockClear();

    await render(createElement(StrictMode, null, createElement(TestNode, { handles: ['b', 'a'] })));
    expect(mocks.updateNodeInternals).toHaveBeenCalledExactlyOnceWith('node');
  });

  it('does not register drag previews rendered outside their workflow node', async () => {
    await render(createElement(TestHandle, { nodeId: 'node', handleId: 'preview' }));
    expect(mocks.updateNodeInternals).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
});
