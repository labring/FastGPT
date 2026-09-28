import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_DETAIL_PANEL_TRANSITION_MS,
  usePanelContentMounted
} from '@/pageComponents/app/detail/components/AppDetailPanelModal';

const PanelContentProbe = () => {
  const [isOpen, setIsOpen] = useState(false);
  const isContentMounted = usePanelContentMounted(isOpen);

  return React.createElement(
    'button',
    {
      'data-mounted': isContentMounted,
      onClick: () => setIsOpen((value) => !value)
    },
    isContentMounted ? 'content' : null
  );
};

describe('usePanelContentMounted', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mounts on the first open and unmounts after the close transition', async () => {
    await act(async () => root.render(React.createElement(PanelContentProbe)));
    const button = container.querySelector('button')!;

    expect(button.dataset.mounted).toBe('false');

    await act(async () => button.click());
    expect(button.dataset.mounted).toBe('true');
    expect(button.textContent).toBe('content');

    await act(async () => button.click());
    expect(button.dataset.mounted).toBe('true');

    await act(async () => vi.advanceTimersByTime(APP_DETAIL_PANEL_TRANSITION_MS));
    expect(button.dataset.mounted).toBe('false');
    expect(button.textContent).toBe('');
  });
});
