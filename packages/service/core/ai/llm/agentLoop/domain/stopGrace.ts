import { getErrText } from '@fastgpt/global/common/error/utils';
import { isModerationBlockErrorMessage } from '@fastgpt/global/core/plugin/moderation/constants';
import { getRemainingStopGraceMs } from '../../../../chat/stop';

// Agent 工具执行取消宽限期略早于外层工作流 3000ms 大限，留出配对收尾与历史落库时间。
export const AGENT_TOOL_STOP_GRACE_MS = 2500;

export type RaceToolWithStopGraceResult<T> =
  | { status: 'resolved'; value: T }
  | { status: 'stopped' };

/**
 * 在统一的停止信号与宽限期下执行 Agent 工具。
 *
 * - 启动前若已收到停止信号，不实际发起工具调用，直接返回 stopped。
 * - 执行中收到停止信号时，给予最多 graceMs 让底层可中断 I/O 自行退出；
 *   超时仍未返回则主动脱钩，并吞掉孤儿 Promise 的迟到异常避免进程未捕获拒绝。
 * - 若工具在停止信号生效后因取消抛错，统一归类为 stopped，不向上暴露为系统故障。
 */
export const raceToolWithStopGrace = async <T>({
  execute,
  stopSignal,
  checkIsStopping,
  graceMs = AGENT_TOOL_STOP_GRACE_MS,
  getStopDeadlineAt,
  reserveMs = 250
}: {
  execute: () => Promise<T>;
  stopSignal?: AbortSignal;
  checkIsStopping?: () => boolean | undefined | null;
  graceMs?: number;
  getStopDeadlineAt?: () => number | undefined;
  reserveMs?: number;
}): Promise<RaceToolWithStopGraceResult<T>> => {
  const isStopping = () => Boolean(stopSignal?.aborted || checkIsStopping?.());
  if (isStopping()) {
    return { status: 'stopped' };
  }

  const taskPromise = execute();
  // 防止脱钩后迟到的异步拒绝演变为 UnhandledPromiseRejection。
  void taskPromise.catch(() => {});

  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let cleanupAbortListener: (() => void) | undefined;

  const stopGracePromise = new Promise<RaceToolWithStopGraceResult<T>>((resolve) => {
    let graceStarted = false;
    const startGraceCountdown = () => {
      if (graceStarted) return;
      graceStarted = true;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      const effectiveGraceMs = getRemainingStopGraceMs({
        stopDeadlineAt: getStopDeadlineAt?.(),
        fallbackGraceMs: graceMs,
        reserveMs
      });
      if (effectiveGraceMs <= 0) {
        resolve({ status: 'stopped' });
        return;
      }
      graceTimer = setTimeout(() => {
        resolve({ status: 'stopped' });
      }, effectiveGraceMs);
      graceTimer.unref?.();
    };

    if (isStopping()) {
      startGraceCountdown();
      return;
    }

    if (stopSignal) {
      const onAbort = () => startGraceCountdown();
      stopSignal.addEventListener('abort', onAbort, { once: true });
      cleanupAbortListener = () => stopSignal.removeEventListener('abort', onAbort);
    }

    if (checkIsStopping) {
      pollTimer = setInterval(() => {
        if (isStopping()) {
          startGraceCountdown();
        }
      }, 50);
      pollTimer.unref?.();
    }
  });

  try {
    return await Promise.race([
      taskPromise.then(
        (value): RaceToolWithStopGraceResult<T> => ({ status: 'resolved', value }),
        (error): Promise<RaceToolWithStopGraceResult<T>> => {
          // 内容审核阻断异常必须透传给上层，不能被并发的用户停止信号吞没。
          if (isStopping() && !isModerationBlockErrorMessage(getErrText(error, ''))) {
            return Promise.resolve({ status: 'stopped' });
          }
          return Promise.reject(error);
        }
      ),
      stopGracePromise
    ]);
  } finally {
    if (graceTimer) clearTimeout(graceTimer);
    if (pollTimer) clearInterval(pollTimer);
    cleanupAbortListener?.();
  }
};
