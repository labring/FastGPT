import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  preloadImage,
  preloadImages,
  resetPreloadImageCacheForTest
} from '../../components/common/Image/preloadImages';

describe('image preload helper', () => {
  beforeEach(() => {
    resetPreloadImageCacheForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it('跳过空地址，不调用 loader', async () => {
    const loader = vi.fn(async () => undefined);

    await preloadImages([undefined, null, ''], { loader });

    expect(loader).not.toHaveBeenCalled();
  });

  it('同一张图片只加载一次，并发调用复用同一个请求', async () => {
    let resolveLoad: () => void = () => undefined;
    const loader = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve;
        })
    );

    const first = preloadImage('https://cdn.example.com/models/OpenAI/logo', { loader });
    const second = preloadImage('https://cdn.example.com/models/OpenAI/logo', { loader });
    // loader 在 Promise 链中调用，先让微任务执行以取得 resolveLoad。
    await Promise.resolve();
    resolveLoad();
    await Promise.all([first, second]);

    // 加载完成后再调用命中缓存，也不再发请求。
    await preloadImage('https://cdn.example.com/models/OpenAI/logo', { loader });

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('批量预热去重后并发加载', async () => {
    const loader = vi.fn(async () => undefined);

    await preloadImages(
      [
        'https://cdn.example.com/models/OpenAI/logo',
        'https://cdn.example.com/models/Yi/logo',
        'https://cdn.example.com/models/OpenAI/logo',
        undefined
      ],
      { loader }
    );

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('加载失败只吞掉错误，不影响页面渲染', async () => {
    const loader = vi.fn(async () => {
      throw new Error('network error');
    });

    await expect(
      preloadImage('https://cdn.example.com/models/Yi/logo', { loader })
    ).resolves.toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('默认实现用 Image 对象下载，onload/onerror 都会结束等待', async () => {
    const created: { src: string; onload?: () => void; onerror?: () => void }[] = [];
    class FakeImage {
      onload?: () => void;
      onerror?: () => void;
      src = '';
      constructor() {
        created.push(this);
      }
    }
    (globalThis as { window?: unknown }).window = { Image: FakeImage };

    const pending = preloadImage('https://cdn.example.com/models/OpenAI/logo');
    await Promise.resolve();
    expect(created).toHaveLength(1);
    expect(created[0].src).toBe('https://cdn.example.com/models/OpenAI/logo');

    created[0].onload?.();
    await expect(pending).resolves.toBeUndefined();
  });

  it('loader 同步抛错也只吞掉错误，不影响页面渲染', async () => {
    const loader = vi.fn(() => {
      throw new Error('sync error');
    });

    await expect(
      preloadImage('https://cdn.example.com/models/Yi/logo', { loader })
    ).resolves.toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('默认实现超时未完成时结束等待，不残留未 settle 的请求', async () => {
    vi.useFakeTimers();
    class FakeImage {
      onload?: () => void;
      onerror?: () => void;
      src = '';
    }
    (globalThis as { window?: unknown }).window = { Image: FakeImage };

    const pending = preloadImage('https://cdn.example.com/models/OpenAI/logo');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toBeUndefined();
  });

  it('没有浏览器 Image 时空实现直接返回', async () => {
    await expect(
      preloadImage('https://cdn.example.com/models/OpenAI/logo')
    ).resolves.toBeUndefined();
  });
});
