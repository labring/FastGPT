import { useRef } from 'react';
import { useMemoizedFn, useThrottleFn } from 'ahooks';
import { shouldFollowGeneratingScroll } from '../utils/scrollUtils';

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
 * - `generatingScroll` 用于流式生成中“条件跟随底部”，避免打断用户查看历史。
 *
 * 关键边界：
 * - `scrollToBottom` 保留 DOM 未挂载时的延迟重试，因为 ChatBox 有动态加载记录、
 *   home/chat 分支切换和恢复生成占位消息，调用时机可能早于滚动容器真实出现。
 * - `generatingScroll` 复用 `shouldFollowGeneratingScroll`，只有用户接近底部或调用方
 *   传入 `force` 时才跟随；这能避免用户向上查看历史时被流式 token 拉回底部。
 */
export const useChatScroll = () => {
  const ScrollContainerRef = useRef<HTMLDivElement>(null);

  /**
   * 滚动到底部。
   *
   * `delay` 用于等待 React 渲染新消息或新高度；内部 `runScroll` 的二次重试用于等待
   * scroll 容器挂载完成。这里不把失败暴露给调用方，因为原 ChatBox 行为就是尽力滚动。
   */
  const scrollToBottom = useMemoizedFn((behavior: 'smooth' | 'auto' = 'smooth', delay = 0) => {
    const runScroll = () => {
      if (!ScrollContainerRef.current) {
        setTimeout(runScroll, 500);
        return;
      }

      ScrollContainerRef.current.scrollTo({
        top: ScrollContainerRef.current.scrollHeight,
        behavior
      });
    };

    setTimeout(() => {
      runScroll();
    }, delay);
  });

  const { run: generatingScroll } = useThrottleFn(
    (force?: boolean) => {
      if (!ScrollContainerRef.current) return;
      // 流式响应会高频触发，先判断用户是否仍在底部附近，再决定是否滚动。
      // `force` 用于发送新消息、恢复占位等明确需要贴底的场景。
      const isBottom = shouldFollowGeneratingScroll({
        scrollTop: ScrollContainerRef.current.scrollTop,
        clientHeight: ScrollContainerRef.current.clientHeight,
        scrollHeight: ScrollContainerRef.current.scrollHeight,
        force
      });

      if (isBottom) {
        scrollToBottom('auto');
      }
    },
    {
      wait: 100
    }
  );

  return {
    ScrollContainerRef,
    scrollToBottom,
    generatingScroll
  };
};
