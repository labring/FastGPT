import type { ChatBoxInputType } from '../ChatBox/type';

export type ChatInstanceIdentity = {
  sourceKey: string;
  chatId: string;
};

export type ChatInstanceActions = {
  sendMessage: (input: ChatBoxInputType) => void;
  continueInteractive: (input: ChatBoxInputType) => void;
  fillInput: (input: ChatBoxInputType) => void;
};

export type ChatInstanceDispatchStatus = 'sent' | 'not-found' | 'ambiguous';

type ChatInstanceActionName = keyof ChatInstanceActions;

type ExternalChatPrompt = {
  type: 'sendPrompt';
  text: string;
  target?: ChatInstanceIdentity;
};

const instanceActionsMap = new Map<string, Set<ChatInstanceActions>>();
let externalPromptListenerCount = 0;

/** 使用完整运行时身份生成稳定 key，避免 app 与 Workflow Builder 复用相同 chatId 时冲突。 */
export const getChatInstanceKey = ({ sourceKey, chatId }: ChatInstanceIdentity) =>
  JSON.stringify([sourceKey, chatId]);

/**
 * 注册一个 ChatBox 实例，并返回只会注销本次注册的 cleanup。
 *
 * Set 不是为了广播，而是为了识别极端情况下重复挂载的相同身份；外部分发遇到多个候选时
 * 会返回 ambiguous，绝不猜测接收者。内部组件始终通过 React Context 直接调用所属实例。
 */
export const registerChatInstanceActions = ({
  identity,
  actions
}: {
  identity: ChatInstanceIdentity;
  actions: ChatInstanceActions;
}) => {
  const instanceKey = getChatInstanceKey(identity);
  const handlers = instanceActionsMap.get(instanceKey) ?? new Set<ChatInstanceActions>();
  handlers.add(actions);
  instanceActionsMap.set(instanceKey, handlers);

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;

    handlers.delete(actions);
    if (handlers.size === 0) {
      instanceActionsMap.delete(instanceKey);
    }
  };
};

/**
 * 将 ChatBox 子树之外的兼容调用精确分发到目标实例。
 * 无 target 时只兼容“页面恰好只有一个 ChatBox”的旧模式；多实例时拒绝广播。
 */
export const dispatchChatInstanceAction = ({
  action,
  input,
  target
}: {
  action: ChatInstanceActionName;
  input: ChatBoxInputType;
  target?: ChatInstanceIdentity;
}): ChatInstanceDispatchStatus => {
  const candidates = (() => {
    if (target) {
      return Array.from(instanceActionsMap.get(getChatInstanceKey(target)) ?? []);
    }
    return Array.from(instanceActionsMap.values()).flatMap((handlers) => Array.from(handlers));
  })();

  if (candidates.length === 0) return 'not-found';
  if (candidates.length > 1) return 'ambiguous';

  candidates[0][action](input);
  return 'sent';
};

const isExternalChatPrompt = (data: unknown): data is ExternalChatPrompt => {
  if (!data || typeof data !== 'object') return false;

  const payload = data as Record<string, unknown>;
  if (payload.type !== 'sendPrompt' || typeof payload.text !== 'string' || !payload.text) {
    return false;
  }
  if (payload.target === undefined) return true;
  if (!payload.target || typeof payload.target !== 'object') return false;

  const target = payload.target as Record<string, unknown>;
  return typeof target.sourceKey === 'string' && typeof target.chatId === 'string';
};

const externalPromptListener = ({ data }: MessageEvent<unknown>) => {
  if (!isExternalChatPrompt(data)) return;

  const status = dispatchChatInstanceAction({
    action: 'continueInteractive',
    input: { text: data.text },
    target: data.target
  });

  if (process.env.NODE_ENV === 'development' && status !== 'sent') {
    // 不输出消息正文和完整身份，避免开发日志泄露用户输入或会话标识。
    console.warn('[ChatBox] External prompt was not dispatched.', {
      status,
      hasTarget: !!data.target,
      registeredInstanceCount: Array.from(instanceActionsMap.values()).reduce(
        (count, handlers) => count + handlers.size,
        0
      )
    });
  }
};

/**
 * 以引用计数维护全页面唯一的 postMessage 监听器。
 * 多个 ChatBox 同时挂载时不会重复消费同一条外部消息，最后一个实例卸载后才真正移除监听。
 */
export const retainExternalChatPromptListener = () => {
  if (typeof window === 'undefined') return () => {};

  if (externalPromptListenerCount === 0) {
    window.addEventListener('message', externalPromptListener);
  }
  externalPromptListenerCount += 1;

  let retained = true;
  return () => {
    if (!retained) return;
    retained = false;
    externalPromptListenerCount -= 1;

    if (externalPromptListenerCount === 0) {
      window.removeEventListener('message', externalPromptListener);
    }
  };
};
