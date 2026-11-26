import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import WorkflowMiniMap from '@/pageComponents/app/detail/WorkflowComponents/Flow/components/WorkflowMiniMap';

const { setViewport, viewport, cancelPendingViewport } = vi.hoisted(() => ({
  setViewport: vi.fn(),
  cancelPendingViewport: vi.fn(),
  viewport: { x: 0, y: 0, zoom: 1 }
}));
vi.mock('@xyflow/react', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => children,
  useReactFlow: () => ({ setViewport }),
  useViewport: () => viewport,
  useStore: (selector: (state: { width: number; height: number }) => number) =>
    selector({ width: 400, height: 200 })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/workflowCanvasContext', () => ({
  useWorkflowCanvasRendererValue: () => [],
  useWorkflowCanvasValue: (selector: (value: unknown) => unknown) =>
    selector({ nodeDimensions: new Map(), cancelPendingViewport })
}));

it('keeps the stationary axis fixed after the minimap bounds move during a drag', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  const render = (label: string) =>
    act(() => root.render(React.createElement(WorkflowMiniMap, { ariaLabel: label })));
  try {
    vi.spyOn(dom.window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await render('Minimap');
    const canvas = container.querySelector('canvas')!;
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    canvas.releasePointerCapture = vi.fn();
    const pointer = (type: string, clientY: number) => {
      const event = new dom.window.MouseEvent(type, { bubbles: true, clientX: 90, clientY });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      canvas.dispatchEvent(event);
    };

    pointer('pointerdown', 46);
    expect(cancelPendingViewport).toHaveBeenCalledOnce();
    const first = setViewport.mock.lastCall![0];
    expect(first.x).toBeLessThan(0);
    Object.assign(viewport, first);
    await render('Updated minimap');

    pointer('pointermove', 56);
    expect(setViewport.mock.lastCall![0]).toEqual({ x: first.x, y: expect.any(Number), zoom: 1 });
    expect(setViewport.mock.lastCall![0].y).toBeLessThan(first.y);
    pointer('pointerup', 56);
    pointer('pointermove', 66);
    expect(setViewport).toHaveBeenCalledTimes(2);
  } finally {
    await act(() => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  }
});
