/**
 * Sandbox WebSocket 重连策略。
 *
 * 前 5 次保持 3s 快速重试，之后进入指数退避（10s → 20s → 40s → 60s 封顶）并持续重试，
 * 直到连接成功或组件卸载。旧实现耗尽后直接停止且不再复位，用户只能刷新页面。
 */

/** 快速重试阶段的最大次数。 */
export const SANDBOX_WS_FAST_RECONNECT_ATTEMPTS = 5;
/** 快速重试间隔（毫秒）。 */
export const SANDBOX_WS_FAST_RECONNECT_DELAY_MS = 3000;
/** 耗尽快速重试后的退避序列（毫秒），最后一项作为封顶值。 */
export const SANDBOX_WS_BACKOFF_DELAYS_MS = [10000, 20000, 40000, 60000] as const;

/**
 * 根据已失败次数计算下一次重连延迟；永远不会返回“放弃”。
 * @param attempts 已安排的失败重连次数
 */
export const getSandboxReconnectDelay = (attempts: number): number => {
  if (attempts < SANDBOX_WS_FAST_RECONNECT_ATTEMPTS) return SANDBOX_WS_FAST_RECONNECT_DELAY_MS;
  const backoffIndex = Math.min(
    attempts - SANDBOX_WS_FAST_RECONNECT_ATTEMPTS,
    SANDBOX_WS_BACKOFF_DELAYS_MS.length - 1
  );
  return SANDBOX_WS_BACKOFF_DELAYS_MS[backoffIndex];
};

export type SandboxReconnectController = {
  /** 记录一次失败并返回下一次重连延迟。 */
  nextDelay: () => number;
  /** 连接成功：清零计数，并允许下一次中断重新提示。 */
  onOpen: () => void;
  /** 是否需要展示一次“正在自动重连”的提示（每次中断只提示一次）。 */
  shouldNotifyRecovering: () => boolean;
  /** 当前累计失败次数，用于日志与测试。 */
  getAttempts: () => number;
};

/** 创建与 React 无关的重连状态机，便于单测覆盖耗尽后仍在重试、onopen 清零等行为。 */
export const createSandboxReconnectController = (): SandboxReconnectController => {
  let attempts = 0;
  let notified = false;

  return {
    nextDelay() {
      const delay = getSandboxReconnectDelay(attempts);
      attempts += 1;
      return delay;
    },
    onOpen() {
      attempts = 0;
      notified = false;
    },
    shouldNotifyRecovering() {
      if (attempts < SANDBOX_WS_FAST_RECONNECT_ATTEMPTS || notified) return false;
      notified = true;
      return true;
    },
    getAttempts: () => attempts
  };
};

/** 生成脱敏后的 WebSocket 端点（只保留协议、host 与 path，丢弃 ticket 等查询参数）。 */
export const getSandboxWsEndpointForLog = (wsUrl: string): string => {
  try {
    const url = new URL(wsUrl);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return 'invalid-url';
  }
};
