import { createContext, useContextSelector } from 'use-context-selector';
import { dispatchChatInstanceAction, type ChatInstanceActions } from './chatInstanceRegistry';

/*
 * 兼容 ChatBox 子树之外的旧调用：单实例页面仍可工作；多实例页面返回 ambiguous 后不发送。
 * ChatBox 内部组件会读取最近一层 Provider，不会经过这个兼容分发器。
 */
const fallbackActions: ChatInstanceActions = {
  sendMessage: (input) => {
    dispatchChatInstanceAction({ action: 'sendMessage', input });
  },
  continueInteractive: (input) => {
    dispatchChatInstanceAction({ action: 'continueInteractive', input });
  },
  fillInput: (input) => {
    dispatchChatInstanceAction({ action: 'fillInput', input });
  }
};

export const ChatInstanceActionsContext = createContext<ChatInstanceActions>(fallbackActions);

/** 获取当前 React 子树所属 ChatBox 的动作，避免通过全局事件猜测接收实例。 */
export const useChatInstanceActions = () =>
  useContextSelector(ChatInstanceActionsContext, (value) => value);
