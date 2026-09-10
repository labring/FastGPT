import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImagePreview } from '@/components/core/dataset/ImagePreviewToken';
import { postGetSearchTestImagePreviewUrls } from '@/web/core/dataset/api/file';

vi.mock('@/web/core/dataset/api/file', () => ({ postGetSearchTestImagePreviewUrls: vi.fn() }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Image/PhotoView', () => ({ MyPhotoSlider: () => null }));
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Box = ({ as = 'div', children, src, alt, onError }: any) =>
    createElement(as, { src, alt, onError }, children);
  return {
    Box,
    Flex: Box,
    Portal: Box,
    CircularProgress: () => createElement('div', { role: 'progressbar' })
  };
});

describe('ImagePreview', () => {
  let root: Root;
  let container: HTMLDivElement;
  const pending: {
    resolve: (items: Awaited<ReturnType<typeof postGetSearchTestImagePreviewUrls>>) => void;
    reject: (error: Error) => void;
  }[] = [];
  const render = async (props: Partial<React.ComponentProps<typeof ImagePreview>> = {}) => {
    await act(async () =>
      root.render(
        React.createElement(ImagePreview, {
          image: { key: 'a' },
          datasetId: 'dataset',
          ...props
        })
      )
    );
  };
  const failImage = async () => {
    await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')));
  };
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    vi.clearAllMocks();
    pending.length = 0;
    vi.mocked(postGetSearchTestImagePreviewUrls).mockImplementation(
      () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    window.close();
    vi.unstubAllGlobals();
  });

  it('finishes loading and uses the latest callback after parent rerenders', async () => {
    const oldCallback = vi.fn();
    const newCallback = vi.fn();
    await render({ onPreviewUrlChange: oldCallback });
    await render({ onPreviewUrlChange: newCallback });
    expect(postGetSearchTestImagePreviewUrls).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role=progressbar]')).not.toBeNull();
    await act(async () => pending[0].resolve([{ key: 'a', previewUrl: 'https://test/a.png' }]));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://test/a.png');
    expect(container.querySelector('[role=progressbar]')).toBeNull();
    expect(oldCallback).not.toHaveBeenCalled();
    expect(newCallback).toHaveBeenCalledWith('https://test/a.png');
    await render({ cachedPreviewUrl: 'https://test/a.png', onPreviewUrlChange: newCallback });
    await failImage();
    expect(postGetSearchTestImagePreviewUrls).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('image_expired');
  });

  it.each(['direct', 'cached'])('refreshes a failed %s URL once', async (source) => {
    const expired = vi.fn();
    await render({
      image: { key: 'a', ...(source === 'direct' ? { url: 'https://test/old.png' } : {}) },
      cachedPreviewUrl: source === 'cached' ? 'https://test/old.png' : undefined,
      onPreviewExpired: expired
    });
    expect(postGetSearchTestImagePreviewUrls).not.toHaveBeenCalled();
    await failImage();
    await act(async () => pending[0].resolve([{ key: 'a', previewUrl: 'https://test/new.png' }]));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://test/new.png');
    await failImage();
    expect(expired).toHaveBeenCalledTimes(1);
    expect(postGetSearchTestImagePreviewUrls).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('image_expired');
  });

  it.each(['empty', 'failure', 'timeout'])('ends loading after %s', async (result) => {
    const expired = vi.fn();
    await render({ onPreviewExpired: expired });
    await act(async () => {
      if (result === 'empty') pending[0].resolve([]);
      if (result === 'failure') pending[0].reject(new Error('offline'));
      if (result === 'timeout') await vi.advanceTimersByTimeAsync(5000);
    });
    expect(container.querySelector('[role=progressbar]')).toBeNull();
    expect(container.textContent).toContain('image_expired');
    expect(expired).toHaveBeenCalledTimes(1);
    await render({ onPreviewExpired: expired });
    expect(postGetSearchTestImagePreviewUrls).toHaveBeenCalledTimes(1);
  });

  it('ignores the previous image response after switching resources', async () => {
    const onReady = vi.fn();
    await render({ onPreviewUrlChange: onReady });
    await render({ image: { key: 'b' }, onPreviewUrlChange: onReady });
    await act(async () => pending[0].resolve([{ key: 'a', previewUrl: 'https://test/a.png' }]));
    expect(onReady).not.toHaveBeenCalled();
    await act(async () => pending[1].resolve([{ key: 'b', previewUrl: 'https://test/b.png' }]));
    expect(onReady).toHaveBeenCalledWith('https://test/b.png');
  });

  it('ignores a response after unmount', async () => {
    const onReady = vi.fn();
    await render({ onPreviewUrlChange: onReady });
    await act(async () => root.render(null));
    await act(async () => pending[0].resolve([{ key: 'a', previewUrl: 'https://test/a.png' }]));
    expect(onReady).not.toHaveBeenCalled();
  });

  it.each([{ image: {} }, { datasetId: undefined }])(
    'expires without a refreshable resource: %j',
    async (props) => {
      await render(props);
      expect(postGetSearchTestImagePreviewUrls).not.toHaveBeenCalled();
      expect(container.textContent).toContain('image_expired');
    }
  );

  it('starts a new lifecycle when the source URL changes', async () => {
    await render();
    await render({ image: { key: 'a', url: 'https://test/external.png' } });
    await act(async () => pending[0].resolve([{ key: 'a', previewUrl: 'https://test/old.png' }]));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://test/external.png');
    await failImage();
    expect(postGetSearchTestImagePreviewUrls).toHaveBeenCalledTimes(2);
  });
});
