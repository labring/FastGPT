import { useCallback, type MutableRefObject } from 'react';
import type { AppQGConfigType } from '@fastgpt/global/core/app/type';
import { postQuestionGuide } from '@/web/core/ai/api';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

/**
 * 创建回答后的问题引导。
 *
 * 这个 hook 只封装 question guide 请求本身，不决定触发时机。调用方仍然负责在一次
 * AI 回答完成、且没有 interactive 等更高优先级 UI 时调用返回的 `createQuestionGuide`。
 *
 * 输入约定：
 * - `appId/chatId/outLinkAuthData` 组成请求目标和鉴权上下文。
 * - `questionGuide` 是 app 的问题引导配置，hook 只读取 `open` 和请求所需配置。
 * - `chatControllerRef` 指向主聊天请求，用于判断当前回答是否已经被用户停止。
 * - `questionGuideControllerRef` 指向问题引导自己的请求，用于让 `abortRequest` 可以同时停止它。
 *
 * 输出约定：
 * - 返回一个稳定的 async 函数；成功拿到字符串数组时写入 `setQuestionGuide`。
 * - 请求失败保持静默，沿用原 ChatBox 行为，不在本 PR 改变 toast 或错误上报策略。
 *
 * 关键边界：
 * - 主聊天请求已经 abort 时不再生成问题引导，否则用户点击停止后仍可能看到新推荐问题。
 * - 每次请求前都会创建新的 AbortController，并写回 ref，让后续 stop/leave 能中断当前请求。
 * - 结果写入后延迟滚动到底部，给推荐问题组件一次渲染高度的时间。
 */
export const useQuestionGuide = ({
  appId,
  chatId,
  questionGuide,
  outLinkAuthData,
  chatControllerRef,
  questionGuideControllerRef,
  setQuestionGuide,
  scrollToBottom
}: {
  appId: string;
  chatId: string;
  questionGuide: AppQGConfigType;
  outLinkAuthData?: OutLinkChatAuthProps;
  chatControllerRef: MutableRefObject<AbortController>;
  questionGuideControllerRef: MutableRefObject<AbortController>;
  setQuestionGuide: (guides: string[]) => void;
  scrollToBottom: (behavior?: 'smooth' | 'auto', delay?: number) => void;
}) => {
  return useCallback(async () => {
    // 保留拆分前语义：只用主聊天请求的 abort 状态阻止回答结束后的问题引导。
    // question guide 自身的旧 controller 可能在新一轮发送开始时被 abort，不能阻断新请求。
    if (!questionGuide.open || chatControllerRef.current?.signal?.aborted) {
      return;
    }
    try {
      // question guide 独立于主聊天请求，但需要被同一个 abortRequest 管理。
      // 因此创建新 controller 后必须写回 ref，而不是只保存在局部变量里。
      const abortSignal = new AbortController();
      questionGuideControllerRef.current = abortSignal;

      const result = await postQuestionGuide(
        {
          appId,
          chatId,
          questionGuide,
          ...outLinkAuthData
        },
        abortSignal
      );
      if (Array.isArray(result)) {
        setQuestionGuide(result);
        // 推荐问题渲染会增加底部高度，延迟滚动可以避免在 DOM 高度更新前滚动失败。
        setTimeout(() => {
          scrollToBottom();
        }, 100);
      }
    } catch {}
  }, [
    questionGuide,
    chatControllerRef,
    questionGuideControllerRef,
    appId,
    chatId,
    outLinkAuthData,
    setQuestionGuide,
    scrollToBottom
  ]);
};
