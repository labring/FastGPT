import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShareBrand from '@/pageComponents/chat/ShareBrand';
import type { ShareBrandSession } from '@/pageComponents/chat/useShareBrandTracking';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  dismiss: vi.fn(),
  isPlus: true,
  getWebReqUrl: vi.fn((url: string) => url)
}));
vi.mock('@/web/core/chat/api', () => ({ postOutLinkBrandTrack: mocks.track }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isPlus: mocks.isPlus } })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/common/system/utils', () => ({ getWebReqUrl: mocks.getWebReqUrl }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@chakra-ui/react', () => ({
  Flex: React.forwardRef(function MockFlex({ children, ...props }: any, ref: any) {
    return React.createElement(
      'div',
      { ref, 'data-share-brand': props['data-share-brand'] },
      children
    );
  }),
  Box: ({ children }: any) => React.createElement('span', {}, children),
  Image: () => null,
  Link: ({ children, href, onClick, target, rel }: any) =>
    React.createElement('a', { href, onClick, target, rel }, children),
  IconButton: ({ onClick }: any) => React.createElement('button', { onClick })
}));
let dom: JSDOM;
let container: HTMLDivElement;
let root: Root;
let session: React.MutableRefObject<ShareBrandSession>;
let intersection: (entries: any[]) => void;
const outLinkAuthData = { shareId: 'share', outLinkUid: 'visitor' };
const render = async (narrow = false, auth = outLinkAuthData) => {
  await act(async () =>
    root.render(
      React.createElement(ShareBrand, {
        narrow,
        session,
        outLinkAuthData: auth,
        onDismiss: mocks.dismiss
      })
    )
  );
};
const enter = async () => {
  await act(async () => intersection([{ isIntersecting: true, intersectionRatio: 1 }]));
};
const hostMessage = async (origin: string, options: Record<string, unknown> = {}) => {
  await act(async () =>
    window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        origin,
        source: window,
        data: { type: 'fastgpt:host-visibility', visible: true, ...options }
      })
    )
  );
};
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.track.mockReset().mockResolvedValue(undefined);
  mocks.getWebReqUrl.mockReset().mockImplementation((url: string) => url);
  vi.useFakeTimers();
  mocks.isPlus = true;
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
      constructor(callback: (entries: any[]) => void) {
        intersection = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  window.umami = undefined;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
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

describe('ShareBrand visible analytics', () => {
  it('waits for viewport intersection and keeps exposure deduplicated through layout changes and remounts', async () => {
    await render();
    expect(mocks.track).not.toHaveBeenCalled();
    await enter();
    expect(mocks.track).toHaveBeenCalledWith({
      authType: 'outLink',
      event: TrackEnum.shareBrandExposure,
      eventId: session.current.eventId,
      outLinkAuthData
    });
    await render(true);
    await act(async () => root.render(null));
    await render();
    expect(mocks.track).toHaveBeenCalledOnce();
  });
  it('requires an official floating handshake, pins the parent origin, and waits until expanded', async () => {
    window.name = 'fastgpt-chatbot-window';
    await render();
    await enter();
    await hostMessage('https://host.example.com');
    expect(mocks.track).not.toHaveBeenCalled();
    await hostMessage('https://host.example.com', { handshake: true, visible: false });
    await hostMessage('https://untrusted.example.com', { handshake: true });
    expect(mocks.track).not.toHaveBeenCalled();
    await hostMessage('https://host.example.com');
    expect(mocks.track).toHaveBeenCalledOnce();
  });
  it('ignores invalid message sources and invalid visible values', async () => {
    window.name = 'fastgpt-chatbot-window';
    await render();
    await enter();
    await act(async () =>
      window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          origin: 'https://host.example.com',
          source: null,
          data: { type: 'fastgpt:host-visibility', handshake: true, visible: true }
        })
      )
    );
    await hostMessage('https://host.example.com', { handshake: true, visible: 'true' });
    await hostMessage('null', { handshake: true });
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it('records clicks only on the brand link', async () => {
    await render();
    expect(container.querySelector('a')?.href).toBe('https://fastgpt.io/');
    await act(async () =>
      container
        .querySelector('a')!
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    );
    expect(mocks.track).toHaveBeenCalledWith({
      authType: 'outLink',
      event: TrackEnum.shareBrandClick,
      outLinkAuthData
    });
    mocks.track.mockClear();
    await act(async () => container.querySelector('button')!.click());
    expect(mocks.dismiss).toHaveBeenCalledOnce();
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it.each([
    { hostname: 'fastgpt.cn', expected: 'https://fastgpt.cn' },
    { hostname: 'cloud.fastgpt.cn', expected: 'https://fastgpt.cn' },
    { hostname: 'fastgpt.cn.example.com', expected: 'https://fastgpt.cn' },
    { hostname: 'fastgpt.io', expected: 'https://fastgpt.io' },
    { hostname: 'chat.example.com', expected: 'https://fastgpt.io' },
    { hostname: 'localhost', expected: 'https://fastgpt.io' }
  ])(
    'links both layouts to $expected on $hostname regardless of application base path',
    async ({ hostname, expected }) => {
      dom.reconfigure({ url: `https://${hostname}:8443/fastgpt/chat/share?source=fastgpt.cn` });
      mocks.getWebReqUrl.mockImplementation((url: string) => `/fastgpt${url}`);
      for (const narrow of [false, true]) {
        await render(narrow);
        const link = container.querySelector('a')!;
        expect(link.getAttribute('href')).toBe(expected);
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
      }
    }
  );
  it('waits for a write acknowledgement and prevents concurrent exposure through remounts', async () => {
    let acknowledge!: () => void;
    mocks.track.mockImplementationOnce(
      () => new Promise<void>((resolve) => (acknowledge = resolve))
    );
    await render();
    await enter();
    expect(session.current).toMatchObject({
      exposed: false,
      pending: expect.any(Promise),
      attempts: 1
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await act(async () => root.render(null));
    await render(true);
    await enter();
    expect(mocks.track).toHaveBeenCalledOnce();
    await act(async () => acknowledge());
    expect(session.current).toMatchObject({ exposed: true, pending: undefined });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mocks.track).toHaveBeenCalledOnce();
  });
  it('reuses the exposure ID after a failed response and a layout remount', async () => {
    mocks.track.mockRejectedValueOnce(new Error('response lost'));
    await render();
    await enter();
    expect(session.current.exposed).toBe(false);

    await act(async () => root.render(null));
    await render(true);
    await enter();
    expect(mocks.track).toHaveBeenCalledTimes(2);
    for (const [body] of mocks.track.mock.calls) {
      expect(body).toEqual({
        authType: 'outLink',
        event: TrackEnum.shareBrandExposure,
        eventId: 'page-exposure-id',
        outLinkAuthData
      });
    }
    expect(session.current.exposed).toBe(true);
  });
  it('stops retrying after three failed writes across remounts', async () => {
    mocks.track.mockRejectedValue(new Error('database unavailable'));
    await render();
    await enter();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mocks.track).toHaveBeenCalledTimes(3);
    expect(session.current).toMatchObject({ exposed: false, pending: undefined, attempts: 3 });
    await act(async () => root.render(null));
    await render();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mocks.track).toHaveBeenCalledTimes(3);
  });
  it('stops exposure retries after 429 across layout remounts without marking it persisted', async () => {
    mocks.track.mockRejectedValue({ code: 429, statusText: 'tooManyRequest' });
    await render();
    await enter();
    expect(session.current).toMatchObject({
      exposed: false,
      pending: undefined,
      attempts: 1,
      rateLimited: true
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => root.render(null));
    await render(true);
    await enter();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(session.current.exposed).toBe(false);
  });
  it('waits for share identity before observing exposure', async () => {
    await render(false, { shareId: 'share', outLinkUid: '' });
    expect(mocks.track).not.toHaveBeenCalled();
    await render();
    await enter();
    expect(mocks.track).toHaveBeenCalledOnce();
  });
  it('requests an official iframe visibility handshake from its parent', async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
    window.name = 'fastgpt-chatbot-window';
    await render();
    await enter();
    expect(postMessage).toHaveBeenCalledWith({ type: 'fastgpt:visibility-ready' }, '*');
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it('does not report clicks before share identity is available', async () => {
    await act(async () =>
      root.render(
        React.createElement(ShareBrand, {
          narrow: false,
          session,
          onDismiss: mocks.dismiss
        })
      )
    );
    await act(async () =>
      container
        .querySelector('a')!
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    );
    expect(mocks.track).not.toHaveBeenCalled();
  });
  it('does not observe exposure in the open source edition and tolerates click failures', async () => {
    mocks.isPlus = false;
    await render();
    await act(async () =>
      container
        .querySelector('a')!
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    );
    expect(mocks.track).not.toHaveBeenCalled();
    mocks.isPlus = true;
    await render(true);
    mocks.track.mockRejectedValueOnce(new Error('write failed'));
    await act(async () =>
      container
        .querySelector('a')!
        .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    );
    expect(mocks.track).toHaveBeenCalledWith({
      authType: 'outLink',
      event: TrackEnum.shareBrandClick,
      outLinkAuthData
    });
    expect(session.current.exposed).toBe(false);
  });
});
