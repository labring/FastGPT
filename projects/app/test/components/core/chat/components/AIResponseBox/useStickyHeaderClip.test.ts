import { JSDOM } from 'jsdom';
import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStickyHeaderClip } from '@/components/core/chat/components/AIResponseBox/useStickyHeaderClip';

describe('useStickyHeaderClip', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLElement;
  let content: HTMLElement;
  let resizeCallbacks: Set<() => void>;
  let headerHeight: number;
  let contentHeight: number;
  const measure = vi.fn();
  const observe = vi.fn();
  const disconnect = vi.fn();
  const requestFrame = vi.fn();

  const Harness = ({
    expanded = true,
    detailKey = 'initial'
  }: {
    expanded?: boolean;
    detailKey?: string;
  }) => {
    const itemRef = useRef<HTMLDivElement>(null);
    const contentRef = useStickyHeaderClip(itemRef);
    return React.createElement(
      'div',
      { ref: itemRef },
      React.createElement('div', { 'data-title': true, style: { position: 'sticky', top: 0 } }),
      expanded
        ? React.createElement('div', { ref: contentRef, id: 'detail', key: detailKey })
        : null
    );
  };

  beforeEach(async () => {
    dom = new JSDOM(
      '<!doctype html><div id="scroll" style="overflow-y:auto"><div id="host"></div></div>'
    );
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    resizeCallbacks = new Set();
    headerHeight = 29;
    contentHeight = 600;
    measure.mockClear();
    observe.mockClear();
    requestFrame.mockClear();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        callback: () => void;
        constructor(callback: () => void) {
          this.callback = callback;
          resizeCallbacks.add(callback);
        }
        disconnect = () => {
          resizeCallbacks.delete(this.callback);
          disconnect();
        };
      }
    );
    vi.spyOn(dom.window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function () {
        measure();
        return new dom.window.DOMRect(
          0,
          0,
          100,
          this.hasAttribute('data-title') ? headerHeight : contentHeight
        );
      }
    );
    container = document.getElementById('scroll')!;
    root = createRoot(document.getElementById('host')!);
    await act(async () => root.render(React.createElement(Harness)));
    content = document.getElementById('detail')!;
    disconnect.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('provides the native timeline inset and window height', () => {
    expect(content.style.getPropertyValue('--processing-clip-top')).toBe('29px');
    expect(content.style.getPropertyValue('--processing-clip-height')).toBe('600px');
    const title = document.querySelector('[data-title]');
    expect(new Set(observe.mock.calls.map(([target]) => target))).toEqual(
      new Set([title, content])
    );
  });

  it('updates the inset for nested offsets and title size changes', () => {
    headerHeight = 24;
    const title = document.querySelector<HTMLElement>('[data-title]')!;
    title.style.top = '29px';
    resizeCallbacks.forEach((callback) => callback());
    expect(content.style.getPropertyValue('--processing-clip-top')).toBe('53px');

    title.style.top = '0px';
    headerHeight = 42;
    contentHeight = 900;
    window.dispatchEvent(new dom.window.Event('resize'));
    expect(content.style.getPropertyValue('--processing-clip-top')).toBe('42px');
    expect(content.style.getPropertyValue('--processing-clip-height')).toBe('900px');
  });

  it('does not schedule JS work or read layout during scrolling', () => {
    measure.mockClear();
    container.dispatchEvent(new dom.window.Event('scroll'));
    window.dispatchEvent(new dom.window.Event('scroll'));
    expect(measure).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
    expect(content.style.clipPath).toBe('');
  });

  it('rebinds replaced panels and clears state and observers on collapse', async () => {
    const previous = content;
    headerHeight = 24;
    await act(async () => root.render(React.createElement(Harness, { detailKey: 'new' })));
    content = document.getElementById('detail')!;
    expect(previous.style.getPropertyValue('--processing-clip-top')).toBe('');
    expect(previous.style.getPropertyValue('--processing-clip-height')).toBe('');
    expect(content.style.getPropertyValue('--processing-clip-top')).toBe('24px');
    expect(resizeCallbacks.size).toBe(1);

    disconnect.mockClear();
    await act(async () => root.render(React.createElement(Harness, { expanded: false })));
    expect(disconnect).toHaveBeenCalledOnce();
    expect(resizeCallbacks.size).toBe(0);
    expect(content.style.getPropertyValue('--processing-clip-top')).toBe('');
    expect(content.style.getPropertyValue('--processing-clip-height')).toBe('');
    measure.mockClear();
    window.dispatchEvent(new dom.window.Event('resize'));
    expect(measure).not.toHaveBeenCalled();
  });
});
