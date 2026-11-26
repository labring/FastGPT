import { JSDOM } from 'jsdom';
import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useShareBrandTracking,
  type ShareBrandSession
} from '@/pageComponents/chat/useShareBrandTracking';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/web/core/chat/api', () => ({ postOutLinkBrandTrack: mocks.track }));

let dom: JSDOM;
let root: Root;
let session: React.MutableRefObject<ShareBrandSession>;
let intersection: (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void;
const outLinkAuthData = { shareId: 'share', outLinkUid: 'visitor' };
const TrackingTarget = () => {
  const element = useRef<HTMLDivElement>(null);
  useShareBrandTracking({ element, session, outLinkAuthData, enabled: true });
  return React.createElement('div', { ref: element });
};
const render = async () => {
  await act(async () => root.render(React.createElement(TrackingTarget)));
};
const setIntersection = async (visible: boolean) => {
  await act(async () =>
    intersection([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }])
  );
};
const advance = async (milliseconds: number) => {
  await act(async () => vi.advanceTimersByTimeAsync(milliseconds));
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.track.mockReset().mockResolvedValue(undefined);
  dom = new JSDOM('<!doctype html><body></body>', {
    url: 'https://chat.example.com',
    pretendToBeVisual: true
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof intersection) {
        intersection = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  session = { current: { exposed: false, eventId: 'page-exposure-id' } };
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  dom.window.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useShareBrandTracking scheduling', () => {
  it('keeps a preloaded floating window idle until the host makes it visible', async () => {
    window.name = 'fastgpt-chatbot-window';
    const timeout = vi.spyOn(window, 'setTimeout');
    const interval = vi.spyOn(window, 'setInterval');
    await render();
    await setIntersection(true);
    await advance(30000);
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();

    await act(async () =>
      window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          origin: 'https://host.example.com',
          source: window,
          data: { type: 'fastgpt:host-visibility', handshake: true, visible: true }
        })
      )
    );
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(session.current.exposed).toBe(true);
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
  });

  it('cancels a failed exposure retry when it leaves the viewport and resumes on visibility', async () => {
    mocks.track.mockRejectedValueOnce(new Error('response lost'));
    const timeout = vi.spyOn(window, 'setTimeout');
    await render();
    await setIntersection(true);
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledOnce();

    await setIntersection(false);
    await advance(5000);
    expect(mocks.track).toHaveBeenCalledOnce();
    await setIntersection(true);
    expect(mocks.track).toHaveBeenCalledTimes(2);
    expect(timeout).toHaveBeenCalledOnce();
    expect(session.current.exposed).toBe(true);
  });

  it('cancels a retry while the document is hidden and retries on its visibility event', async () => {
    mocks.track.mockRejectedValueOnce(new Error('response lost'));
    await render();
    await setIntersection(true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')));
    await advance(5000);
    expect(mocks.track).toHaveBeenCalledOnce();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')));
    expect(mocks.track).toHaveBeenCalledTimes(2);
    expect(session.current.exposed).toBe(true);
  });

  it('lets the new layout retry an in-flight request that fails after the old layout unmounts', async () => {
    let fail!: (error: Error) => void;
    mocks.track.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => (fail = reject))
    );
    const timeout = vi.spyOn(window, 'setTimeout');
    await render();
    await setIntersection(true);
    await act(async () => root.render(null));
    await render();
    await setIntersection(true);
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(timeout).not.toHaveBeenCalled();

    await act(async () => fail(new Error('response lost')));
    expect(timeout).toHaveBeenCalledOnce();
    await advance(1000);
    expect(mocks.track).toHaveBeenCalledTimes(2);
    expect(mocks.track).toHaveBeenLastCalledWith({
      authType: 'outLink',
      event: TrackEnum.shareBrandExposure,
      eventId: 'page-exposure-id',
      outLinkAuthData
    });
    expect(session.current.exposed).toBe(true);
  });

  it('does not schedule retries when a request fails after the target has unmounted', async () => {
    let fail!: (error: Error) => void;
    mocks.track.mockImplementationOnce(
      () => new Promise<void>((_resolve, reject) => (fail = reject))
    );
    const timeout = vi.spyOn(window, 'setTimeout');
    await render();
    await setIntersection(true);
    await act(async () => root.render(null));
    await act(async () => fail(new Error('response lost')));
    await advance(5000);
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(timeout).not.toHaveBeenCalled();
    expect(session.current.pending).toBeUndefined();
  });

  it('cancels a scheduled retry on unmount', async () => {
    mocks.track.mockRejectedValue(new Error('response lost'));
    await render();
    await setIntersection(true);
    await act(async () => root.render(null));
    await advance(5000);
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(session.current.exposed).toBe(false);
  });
});
