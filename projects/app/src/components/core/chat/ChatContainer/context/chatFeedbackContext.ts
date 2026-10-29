import { createContext } from 'use-context-selector';
import type { useChatFeedbackActions } from '../ChatBox/hooks/useChatFeedbackActions';

/** 版本卡片复用所属 ChatBox 的反馈操作，弹窗和请求状态仍由 ChatBox 统一管理。 */
export const ChatFeedbackContext = createContext<
  | Pick<
      ReturnType<typeof useChatFeedbackActions>,
      'onAddUserLike' | 'onAddUserDislike' | 'likeFeedbackEffect' | 'pendingFeedbackIds'
    >
  | undefined
>(undefined);
