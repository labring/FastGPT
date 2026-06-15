import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useMemoizedFn, useThrottleFn } from 'ahooks';
import { isChatScrollAtBottom, shouldShowChatScrollToBottomButton } from '../utils/scrollUtils';

/**
 * 管理 ChatBox 的滚动容器和生成中跟随底部逻辑。
 *
 * 这个 hook 只提供滚动能力，不决定哪些业务时机要滚动。records loaded、发送消息、
 * 恢复生成、问题引导等流程仍由调用方判断时机后调用 `scrollToBottom` 或
 * `generatingScroll`。
 *
 * 输出约定：
 * - `ScrollContainerRef` 绑定到聊天记录滚动容器。
 * - `scrollToBottom` 用于明确要求滚到底部，支持 smooth/auto 和延迟。
 * - `generatingScroll` 用于流式生成中根据用户意图跟随底部，避免打断用户查看历史。
 * - `isScrollAtBottom` 只描述当前滚动位置。
 * - `isScrollToBottomButtonVisible` 只在用户主动离开底部后展示，避免流式内容追加或图片
 *   加载造成瞬时距离变化时按钮闪烁。
 *
 * 关键边界：
 * - `scrollToBottom` 保留 DOM 未挂载时的延迟重试，因为 ChatBox 有动态加载记录、
 *   home/chat 分支切换和恢复生成占位消息，调用时机可能早于滚动容器真实出现。
 * - 用户主动向上滚动后，当前轮生成不再自动吸附底部；滚回底部或显式点击回到底部后恢复。
 * - 内容高度变化时只看 `shouldFollowGeneratingRef`，不再用底部距离反推吸底意图，避免图片加载等
 *   异步撑高内容时丢失吸底。
 */
export const useChatScroll = () => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const shouldFollowGeneratingRef = useRef(true);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const ScrollContainerRef = useMemo(
    () =>
      ({
        get current() {
          return scrollContainerRef.current;
        },
        set current(container: HTMLDivElement | null) {
          if (scrollContainerRef.current === container) return;
          scrollContainerRef.current = container;
          setScrollContainer(container);
        }
      }) as MutableRefObject<HTMLDivElement | null>,
    []
  );
  const [isScrollAtBottom, setIsScrollAtBottom] = useState(true);
  const [isScrollToBottomButtonVisible, setIsScrollToBottomButtonVisible] = useState(false);

  /**
   * 同步用户是否已经滚动到底部。
   *
   * 这个状态只服务 UI 提示，不参与生成中的自动贴底逻辑，避免额外状态改变影响流式
   * token 的滚动节奏。没有可滚动内容时视为已经在底部，因此不会展示回到底部按钮。
   */
  const syncScrollAtBottom = useMemoizedFn(
    ({ fromScroll = false }: { fromScroll?: boolean } = {}) => {
      const container = scrollContainerRef.current;
      if (!container) {
        shouldFollowGeneratingRef.current = true;
        lastScrollTopRef.current = 0;
        setIsScrollAtBottom(true);
        setIsScrollToBottomButtonVisible(false);
        return;
      }

      const scrollState = {
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        scrollHeight: container.scrollHeight
      };
      const nextIsScrollAtBottom = isChatScrollAtBottom(scrollState);

      if (
        fromScroll &&
        container.scrollTop < lastScrollTopRef.current - 1 &&
        !nextIsScrollAtBottom
      ) {
        shouldFollowGeneratingRef.current = false;
      }
      if (nextIsScrollAtBottom) {
        shouldFollowGeneratingRef.current = true;
      }
      lastScrollTopRef.current = container.scrollTop;

      setIsScrollAtBottom(nextIsScrollAtBottom);
      setIsScrollToBottomButtonVisible(
        !nextIsScrollAtBottom &&
          shouldShowChatScrollToBottomButton({
            ...scrollState,
            userHasLeftBottom: !shouldFollowGeneratingRef.current
          })
      );
    }
  );

  /**
   * 内容尺寸变化后的吸底补偿。
   *
   * 图片加载、代码块渲染和 Markdown 重排都会在用户没有滚动的情况下改变 scrollHeight；
   * 只要用户意图仍是吸底，就直接补滚到底部。若用户已主动上滚，`shouldFollowGeneratingRef`
   * 为 false，不会打断阅读历史。
   */
  const syncAfterContentChange = useMemoizedFn(() => {
    syncScrollAtBottom();
    if (!shouldFollowGeneratingRef.current) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'auto'
    });
    syncScrollAtBottom();
  });

  /**
   * 滚动到底部。
   *
   * `delay` 用于等待 React 渲染新消息或新高度；内部 `runScroll` 的二次重试用于等待
   * scroll 容器挂载完成。这里不把失败暴露给调用方，因为原 ChatBox 行为就是尽力滚动。
   */
  const scrollToBottom = useMemoizedFn((behavior: 'smooth' | 'auto' = 'smooth', delay = 0) => {
    const runScroll = () => {
      if (!scrollContainerRef.current) {
        setTimeout(runScroll, 500);
        return;
      }

      shouldFollowGeneratingRef.current = true;
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior
      });
      syncScrollAtBottom();
    };

    setTimeout(() => {
      runScroll();
    }, delay);
  });

  const { run: generatingScroll } = useThrottleFn(
    (force?: boolean) => {
      if (!scrollContainerRef.current) return;
      if (!shouldFollowGeneratingRef.current && !force) return;

      scrollToBottom('auto');
    },
    {
      wait: 100
    }
  );

  useEffect(() => {
    const container = scrollContainer;
    if (!container) {
      syncScrollAtBottom();
      return;
    }

    syncScrollAtBottom();
    const handleScroll = () => syncScrollAtBottom({ fromScroll: true });
    const handleResize = () => syncAfterContentChange();

    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            syncAfterContentChange();
          });
    resizeObserver?.observe(container);

    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? undefined
        : new MutationObserver(() => {
            syncAfterContentChange();
          });
    mutationObserver?.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [scrollContainer, syncAfterContentChange, syncScrollAtBottom]);

  return {
    ScrollContainerRef,
    scrollToBottom,
    generatingScroll,
    isScrollAtBottom,
    isScrollToBottomButtonVisible
  };
};
