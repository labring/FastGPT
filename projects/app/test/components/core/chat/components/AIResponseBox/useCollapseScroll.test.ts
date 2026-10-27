import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollapseScroll } from '@/components/core/chat/components/AIResponseBox/useCollapseScroll';

describe('useCollapseScroll', () => {
  let dom: JSDOM;
  let root: Root | undefined;
  let onChange: ReturnType<typeof useCollapseScroll>['onCollapseChange'];
  let frames: Map<number, FrameRequestCallback>;
  let container: HTMLDivElement;
  let outer: HTMLDivElement;
  let item: HTMLDivElement;
  let header: HTMLDivElement;
  let itemTop: number;
  let headerTop: number;
  const scroll = vi.fn();
  const outerScroll = vi.fn();

  const Harness = () => {
    const { collapseRef, onCollapseChange } = useCollapseScroll();
    onChange = onCollapseChange;
    return React.createElement(
      'div',
      { ref: collapseRef },
      React.createElement('div', { style: { position: 'sticky', top: 0 } })
    );
  };
  const runFrame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  };

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    frames = new Map();
    let nextFrame = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
    vi.clearAllMocks();

    outer = document.createElement('div');
    outer.style.overflowY = 'auto';
    outer.scrollTo = outerScroll;
    container = document.createElement('div');
    container.style.overflowY = 'auto';
    container.scrollTo = scroll;
    container.scrollTop = 300;
    Object.defineProperty(container, 'clientTop', { value: 2 });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new dom.window.DOMRect(0, 40));
    const clip = document.createElement('div');
    clip.style.overflowY = 'hidden';
    container.appendChild(clip);
    outer.appendChild(container);
    document.body.appendChild(outer);
    root = createRoot(clip);
    await act(async () => root!.render(React.createElement(Harness)));
    item = clip.firstElementChild as HTMLDivElement;
    header = item.firstElementChild as HTMLDivElement;
    itemTop = -500;
    headerTop = 42;
    vi.spyOn(item, 'getBoundingClientRect').mockImplementation(
      () => new dom.window.DOMRect(0, itemTop)
    );
    vi.spyOn(header, 'getBoundingClientRect').mockImplementation(
      () => new dom.window.DOMRect(0, headerTop)
    );
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('waits for the collapsed layout and scrolls only the nearest container to the flow anchor', () => {
    onChange(-1);
    expect(scroll).not.toHaveBeenCalled();
    // 折叠后的滚动锚定可能改变位置，必须读取下一帧的位置而非点击时的吸顶标题位置。
    itemTop = -100;
    runFrame();

    expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 158, behavior: 'auto' });
    expect(outerScroll).not.toHaveBeenCalled();
  });

  it('does not reposition on expansion and cancels a collapse that is immediately reopened', () => {
    onChange(0);
    expect(frames.size).toBe(0);
    onChange([]);
    expect(frames.size).toBe(1);
    onChange([0]);
    runFrame();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('keeps a collapsed item below the outer sticky processing title', () => {
    item.style.scrollMarginTop = '29px';
    header.style.top = '29px';
    headerTop = 71;
    itemTop = -100;
    onChange(-1);
    runFrame();

    expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 129, behavior: 'auto' });
  });

  it.each([42, 150])('does not reposition a title at its normal flow position (%s)', (top) => {
    itemTop = top;
    headerTop = top;
    onChange(-1);
    expect(frames.size).toBe(0);
    runFrame();
    expect(scroll).not.toHaveBeenCalled();
    expect(outerScroll).not.toHaveBeenCalled();
  });

  it('does not reposition when sticky positioning is disabled', () => {
    header.style.position = 'static';
    onChange(-1);
    expect(frames.size).toBe(0);
    runFrame();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('cancels pending scrolling when the owning processing item unmounts', async () => {
    onChange(-1);
    await act(async () => root!.unmount());
    root = undefined;
    expect(frames.size).toBe(0);
    runFrame();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does not scroll the page when there is no containing scroll area', () => {
    container.style.overflowY = 'visible';
    outer.style.overflowY = 'visible';
    onChange(-1);
    runFrame();
    expect(scroll).not.toHaveBeenCalled();
    expect(outerScroll).not.toHaveBeenCalled();
  });
});
