export const STREAM_RENDER_INTERVAL_MS = 50;

export type StreamRenderSchedulerRuntime = {
  now: () => number;
  setTimer: (callback: () => void, delay: number) => number;
  clearTimer: (id: number) => void;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
};

const browserRuntime: StreamRenderSchedulerRuntime = {
  now: () => performance.now(),
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (id) => window.clearTimeout(id),
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id)
};

/**
 * 创建流式消息 UI 调度器。
 *
 * 普通增量两次 flush 至少间隔 `intervalMs`，timer 到期后再通过 rAF 对齐 paint。`flush`
 * 用于完成和异常收尾，会取消待执行任务并立即提交；`cancel` 用于离开会话，只清理不提交。
 */
export const createStreamRenderScheduler = ({
  onFlush,
  intervalMs = STREAM_RENDER_INTERVAL_MS,
  runtime = browserRuntime
}: {
  onFlush: () => void;
  intervalMs?: number;
  runtime?: StreamRenderSchedulerRuntime;
}) => {
  let lastFlushAt = Number.NEGATIVE_INFINITY;
  let timerId: number | undefined;
  let frameId: number | undefined;

  const cancel = () => {
    if (timerId !== undefined) {
      runtime.clearTimer(timerId);
      timerId = undefined;
    }
    if (frameId !== undefined) {
      runtime.cancelFrame(frameId);
      frameId = undefined;
    }
  };

  const commit = () => {
    lastFlushAt = runtime.now();
    onFlush();
  };

  const schedule = () => {
    if (timerId !== undefined || frameId !== undefined) return;

    const elapsed = runtime.now() - lastFlushAt;
    const delay = Number.isFinite(elapsed) ? Math.max(intervalMs - elapsed, 0) : 0;

    timerId = runtime.setTimer(() => {
      timerId = undefined;
      frameId = runtime.requestFrame(() => {
        frameId = undefined;
        commit();
      });
    }, delay);
  };

  const flush = () => {
    cancel();
    commit();
  };

  return {
    schedule,
    flush,
    cancel
  };
};
