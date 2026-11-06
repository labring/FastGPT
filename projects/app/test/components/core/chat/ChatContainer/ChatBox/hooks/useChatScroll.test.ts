import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatScroll } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatScroll';

describe('useChatScroll', () => {
  let dom: JSDOM;
  let root: Root;
  let hooks: Record<string, ReturnType<typeof useChatScroll>>;
  let resizeObservers: Map<() => void, Set<Element>>;

  const Harness = ({ id, mounted = true }: { id: string; mounted?: boolean }) => {
    const scroll = useChatScroll();
    hooks[id] = scroll;
    return mounted ? React.createElement('div', { id, ref: scroll.ScrollContainerRef }) : null;
  };

  /** JSDOM 不计算布局；补齐容器尺寸及浏览器 scrollTo 的边界和滚动事件。 */
  const createFixture = (container: HTMLDivElement) => {
    const layout = { scrollHeight: 2000, clientHeight: 400, top: 80, clientTop: 3 };
    const scrollTo = vi.fn(({ top = container.scrollTop }: ScrollToOptions) => {
      const nextTop = Math.max(0, Math.min(top, layout.scrollHeight - layout.clientHeight));
      if (nextTop === container.scrollTop) return;
      container.scrollTop = nextTop;
      container.dispatchEvent(new dom.window.Event('scroll'));
    });
    Object.defineProperties(container, {
      scrollHeight: { get: () => layout.scrollHeight },
      clientHeight: { get: () => layout.clientHeight },
      clientTop: { get: () => layout.clientTop },
      scrollTo: { value: scrollTo }
    });
    vi.spyOn(container, 'getBoundingClientRect').mockImplementation(
      () => new dom.window.DOMRect(0, layout.top, 600, layout.clientHeight)
    );
    return { container, layout, scrollTo };
  };

  /** 锚点使用内容坐标，测量结果随实际 scrollTop 改变，避免固定矩形掩盖重复定位。 */
  const createPreview = (
    fixture: ReturnType<typeof createFixture>,
    { id = 'preview-1', top = 650 }: { id?: string; top?: number } = {}
  ) => {
    const preview = document.createElement('div');
    preview.setAttribute('data-chat-scroll-anchor', id);
    vi.spyOn(preview, 'getBoundingClientRect').mockImplementation(
      () =>
        new dom.window.DOMRect(
          0,
          fixture.layout.top + fixture.layout.clientTop + top - fixture.container.scrollTop,
          500,
          900
        )
    );
    return preview;
  };

  const mount = async (ids = ['chat']) => {
    await act(async () =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          ids.map((id) => React.createElement(Harness, { id, key: id }))
        )
      )
    );
    return ids.map((id) => createFixture(document.querySelector<HTMLDivElement>('#' + id)!));
  };
  const advanceTime = (milliseconds = 200) =>
    act(async () => vi.advanceTimersByTimeAsync(milliseconds));
  const userScrollTo = (container: HTMLDivElement, top: number) =>
    act(async () => {
      container.scrollTop = top;
      container.dispatchEvent(new dom.window.Event('scroll'));
    });
  const notifyResize = (container: HTMLDivElement) =>
    act(async () => {
      resizeObservers.forEach((targets, callback) => {
        if (targets.has(container)) callback();
      });
    });

  beforeEach(() => {
    // 必须等仓库的服务端 setup 完成后再创建 window，避免影响数据库模型初始化。
    dom = new JSDOM('<!doctype html><div id="root"></div>', {
      url: 'https://fastgpt.example',
      pretendToBeVisual: true
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    hooks = {};
    resizeObservers = new Map();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private targets = new Set<Element>();
        constructor(private callback: () => void) {
          resizeObservers.set(callback, this.targets);
        }
        observe = (target: Element) => this.targets.add(target);
        disconnect = () => resizeObservers.delete(this.callback);
      }
    );
    // 保留真实 MutationObserver 的微任务，只控制滚动延迟及 ahooks 节流使用的时钟。
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    root = createRoot(document.getElementById('root')!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.clearAllTimers();
    vi.useRealTimers();
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('autoScrollToBottom', () => {
    it('rechecks a preview that appeared after an automatic scroll was scheduled', async () => {
      const fixture = (await mount())[0];
      await act(async () => {
        hooks.chat.autoScrollToBottom('smooth', 100);
        fixture.container.append(createPreview(fixture));
      });
      expect(fixture.container.scrollTop).toBe(650);
      expect(fixture.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 650, behavior: 'auto' });

      await userScrollTo(fixture.container, 900);
      await advanceTime();
      expect(fixture.container.scrollTop).toBe(900);
      expect(fixture.scrollTo).toHaveBeenCalledOnce();
    });

    it('preserves reading position when the same preview gains an asynchronous chart', async () => {
      const fixture = (await mount())[0];
      const preview = createPreview(fixture);
      await act(async () => fixture.container.append(preview));
      await userScrollTo(fixture.container, 900);

      await act(async () => {
        fixture.layout.scrollHeight += 1200;
        preview.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      });
      await notifyResize(fixture.container);
      await act(async () => {
        window.dispatchEvent(new dom.window.Event('resize'));
        hooks.chat.autoScrollToBottom('auto');
        hooks.chat.generatingScroll();
        hooks.chat.generatingScroll(true);
      });
      await advanceTime();

      expect(fixture.container.scrollTop).toBe(900);
      expect(fixture.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 650, behavior: 'auto' });
    });

    it.each(['id', 'element'] as const)(
      'positions a new preview once when its %s changes',
      async (change) => {
        const fixture = (await mount())[0];
        const preview = createPreview(fixture);
        await act(async () => fixture.container.append(preview));
        await userScrollTo(fixture.container, 900);

        await act(async () => {
          if (change === 'id') {
            preview.setAttribute('data-chat-scroll-anchor', 'preview-2');
          } else {
            preview.replaceWith(createPreview(fixture, { top: 1050 }));
          }
        });
        const expectedTop = change === 'id' ? 650 : 1050;
        expect(fixture.container.scrollTop).toBe(expectedTop);
        expect(fixture.scrollTo).toHaveBeenCalledTimes(2);

        await userScrollTo(fixture.container, expectedTop + 120);
        await act(async () => {
          hooks.chat.autoScrollToBottom();
          hooks.chat.generatingScroll(true);
        });
        await advanceTime();
        expect(fixture.container.scrollTop).toBe(expectedTop + 120);
        expect(fixture.scrollTo).toHaveBeenCalledTimes(2);
      }
    );

    it('resumes automatic scrolling and height compensation after confirmation clears the marker', async () => {
      const fixture = (await mount())[0];
      const preview = createPreview(fixture);
      await act(async () => fixture.container.append(preview));
      await userScrollTo(fixture.container, 900);
      await act(async () => preview.removeAttribute('data-chat-scroll-anchor'));

      await act(async () => hooks.chat.autoScrollToBottom('auto'));
      await advanceTime(0);
      expect(fixture.container.scrollTop).toBe(1600);
      expect(hooks.chat.isScrollAtBottom).toBe(true);

      fixture.layout.scrollHeight = 2800;
      await notifyResize(fixture.container);
      expect(fixture.container.scrollTop).toBe(2400);
      expect(hooks.chat.isScrollAtBottom).toBe(true);
    });
  });

  describe('generatingScroll', () => {
    it('rechecks the preview for queued leading and trailing throttle callbacks', async () => {
      const fixture = (await mount())[0];
      await act(async () => {
        hooks.chat.generatingScroll();
        hooks.chat.generatingScroll(true);
        fixture.container.append(createPreview(fixture));
      });
      expect(fixture.container.scrollTop).toBe(650);

      await userScrollTo(fixture.container, 900);
      await advanceTime();
      expect(fixture.container.scrollTop).toBe(900);
      expect(fixture.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 650, behavior: 'auto' });
    });

    it('keeps following ordinary streamed output and asynchronous height growth', async () => {
      const fixture = (await mount())[0];
      await act(async () => hooks.chat.generatingScroll());
      await advanceTime(0);
      expect(fixture.container.scrollTop).toBe(1600);

      fixture.layout.scrollHeight = 3000;
      await notifyResize(fixture.container);
      expect(fixture.container.scrollTop).toBe(2600);
      expect(hooks.chat.isScrollToBottomButtonVisible).toBe(false);

      fixture.layout.scrollHeight = 3400;
      await act(async () => hooks.chat.generatingScroll());
      await advanceTime();
      expect(fixture.container.scrollTop).toBe(3000);
      expect(hooks.chat.isScrollAtBottom).toBe(true);
    });

    it('preserves upward reading until the user scrolls back to the bottom', async () => {
      const fixture = (await mount())[0];
      await act(async () => hooks.chat.autoScrollToBottom('auto'));
      await advanceTime(0);
      await userScrollTo(fixture.container, 1000);
      expect(hooks.chat.isScrollAtBottom).toBe(false);
      expect(hooks.chat.isScrollToBottomButtonVisible).toBe(true);

      await act(async () => {
        fixture.layout.scrollHeight = 3000;
        fixture.container.append(document.createTextNode('next streamed answer'));
        hooks.chat.generatingScroll();
      });
      await notifyResize(fixture.container);
      await advanceTime();
      expect(fixture.container.scrollTop).toBe(1000);
      expect(fixture.scrollTo).toHaveBeenCalledOnce();

      await userScrollTo(fixture.container, 2600);
      expect(hooks.chat.isScrollAtBottom).toBe(true);
      expect(hooks.chat.isScrollToBottomButtonVisible).toBe(false);
      fixture.layout.scrollHeight = 3400;
      await act(async () => hooks.chat.generatingScroll());
      await advanceTime();
      expect(fixture.container.scrollTop).toBe(3000);
    });

    it('allows forced following to resume after upward scrolling without a pending preview', async () => {
      const fixture = (await mount())[0];
      await act(async () => hooks.chat.autoScrollToBottom('auto'));
      await advanceTime(0);
      await userScrollTo(fixture.container, 1000);

      await act(async () => hooks.chat.generatingScroll(true));
      await advanceTime();
      expect(fixture.container.scrollTop).toBe(1600);
      expect(hooks.chat.isScrollAtBottom).toBe(true);
      expect(hooks.chat.isScrollToBottomButtonVisible).toBe(false);
    });
  });

  describe('scrollToBottom', () => {
    it.each(['smooth', 'auto'] as const)(
      'honors a manual %s request without letting later automatic calls reposition the same preview',
      async (behavior) => {
        const fixture = (await mount())[0];
        await act(async () => fixture.container.append(createPreview(fixture)));
        await userScrollTo(fixture.container, 900);
        await act(async () => hooks.chat.scrollToBottom(behavior));
        await advanceTime(0);

        expect(fixture.container.scrollTop).toBe(1600);
        expect(fixture.scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior });
        expect(hooks.chat.isScrollAtBottom).toBe(true);
        expect(hooks.chat.isScrollToBottomButtonVisible).toBe(false);

        fixture.layout.scrollHeight = 2600;
        await notifyResize(fixture.container);
        await act(async () => {
          hooks.chat.autoScrollToBottom('auto');
          hooks.chat.generatingScroll(true);
        });
        await advanceTime();
        expect(fixture.container.scrollTop).toBe(1600);
        expect(fixture.scrollTo).toHaveBeenCalledTimes(2);
      }
    );

    it('honors a delayed manual request even when a preview appears before it executes', async () => {
      const fixture = (await mount())[0];
      await act(async () => {
        hooks.chat.scrollToBottom(undefined, 100);
        fixture.container.append(createPreview(fixture));
      });
      expect(fixture.container.scrollTop).toBe(650);

      await advanceTime();
      expect(fixture.container.scrollTop).toBe(1600);
      expect(fixture.scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'smooth' });
      await act(async () => hooks.chat.autoScrollToBottom());
      await advanceTime(0);
      expect(fixture.container.scrollTop).toBe(1600);
      expect(fixture.scrollTo).toHaveBeenCalledTimes(2);
    });
  });

  describe('ScrollContainerRef', () => {
    it('isolates preview discovery and reading positions between chat containers', async () => {
      const [chat, other] = await mount(['chat', 'other']);
      await act(async () => chat.container.append(createPreview(chat)));
      await act(async () => hooks.other.autoScrollToBottom('auto'));
      await advanceTime(0);
      expect(chat.container.scrollTop).toBe(650);
      expect(other.container.scrollTop).toBe(1600);

      await userScrollTo(chat.container, 900);
      await act(async () => other.container.append(createPreview(other, { top: 1050 })));
      expect(other.container.scrollTop).toBe(1050);
      await act(async () => {
        hooks.chat.generatingScroll(true);
        hooks.other.generatingScroll(true);
      });
      await advanceTime();
      expect(chat.container.scrollTop).toBe(900);
      expect(other.container.scrollTop).toBe(1050);
      expect(chat.scrollTo).toHaveBeenCalledOnce();
      expect(other.scrollTo).toHaveBeenCalledTimes(2);
    });

    it('rechecks the preview when retrying an automatic request made before container mounting', async () => {
      await act(async () =>
        root.render(React.createElement(Harness, { id: 'chat', mounted: false }))
      );
      expect(hooks.chat.ScrollContainerRef.current).toBeNull();
      expect(hooks.chat.isScrollAtBottom).toBe(true);
      await act(async () => {
        hooks.chat.generatingScroll(true);
        hooks.chat.autoScrollToBottom('auto');
      });
      await advanceTime(0);

      await act(async () => root.render(React.createElement(Harness, { id: 'chat' })));
      const fixture = createFixture(document.querySelector<HTMLDivElement>('#chat')!);
      await act(async () => fixture.container.append(createPreview(fixture)));
      await userScrollTo(fixture.container, 900);
      await advanceTime(500);
      expect(fixture.container.scrollTop).toBe(900);
      expect(fixture.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 650, behavior: 'auto' });
    });
  });
});
