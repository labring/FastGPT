import { act, createElement, Fragment, StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHandleInternals } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/useHandleInternals';

const mocks = vi.hoisted(() => ({ updateNodeInternals: vi.fn() }));
vi.mock('reactflow', () => ({ useUpdateNodeInternals: () => mocks.updateNodeInternals }));

/** 保留 ReactFlow 实际输出的端口 DOM，只有测量入口被替换，DOM 变更监听使用真实实现。 */
const TestHandle = ({ nodeId, handleId }: { nodeId: string; handleId: string }) => {
  const ref = useHandleInternals(nodeId);
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
  showSpacer = false
}: {
  nodeId?: string;
  handles?: string[];
  showNote?: boolean;
  showSpacer?: boolean;
}) =>
  createElement(
    'div',
    { className: 'react-flow__node', 'data-id': nodeId },
    showSpacer && createElement('span', { 'data-spacer': '' }),
    handles.map((handleId) => createElement(TestHandle, { key: handleId, nodeId, handleId })),
    showNote && createElement('span', null, 'Updated input description')
  );

describe('useHandleInternals', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLElement;
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
    mocks.updateNodeInternals.mockClear();
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
    container = document.getElementById('root')!;
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
