import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as reactFlow from 'reactflow';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import { useNodeHandleDrag } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/useNodeHandleDrag';

describe('useNodeHandleDrag', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;
  let store: ReturnType<typeof reactFlow.useStoreApi>;
  let drag: ReturnType<typeof useNodeHandleDrag>;
  let frames: FrameRequestCallback[];
  const handleId = getHandleId('node', 'source', 'branch');

  const Harness = ({ cloned = false }: { cloned?: boolean }) => {
    const currentStore = reactFlow.useStoreApi();
    drag = useNodeHandleDrag('node');
    useLayoutEffect(() => {
      store = currentStore;
    }, [currentStore]);
    return createElement(
      'div',
      { className: 'react-flow__viewport' },
      createElement(
        'div',
        { className: 'react-flow__node', 'data-id': 'node' },
        !cloned &&
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
  const render = async (cloned = false) => {
    await act(async () =>
      root.render(
        createElement(reactFlow.ReactFlowProvider, null, createElement(Harness, { cloned }))
      )
    );
  };
  const measure = () =>
    store.getState().updateNodeDimensions([
      {
        id: 'node',
        nodeElement: container.querySelector<HTMLDivElement>('.react-flow__node')!,
        forceUpdate: true
      }
    ]);
  const bounds = () =>
    store.getState().nodeInternals.get('node')?.[reactFlow.internalsSymbol]?.handleBounds?.source;

  beforeEach(async () => {
    frames = [];
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
          return new dom.window.DOMRect(
            100 + (Number.parseFloat(this.style.left) || 200) * 2,
            200 + (Number.parseFloat(this.style.top) || 40) * 2,
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
    store.setState({ domNode: container, transform: [0, 0, 2] });
    store.getState().setNodes([{ id: 'node', position: { x: 0, y: 0 }, data: {} }]);
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
      measure();
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
      measure();
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
});
