import type { SandboxRuntimeStatusResponse } from '@fastgpt/global/core/ai/sandbox/type';

type StartRuntimeUpgradePollingParams = {
  intervalMs: number;
  request: (abortCtrl: AbortController) => Promise<SandboxRuntimeStatusResponse>;
  onStatus: (status: SandboxRuntimeStatusResponse) => void | Promise<void>;
  onError: (error: unknown) => void;
};

/**
 * 串行轮询 Skill runtime 升级状态。
 *
 * 每次状态处理完成后才安排下一次请求；停止时会同时清理 timer 和当前请求，确保旧页面不会
 * 继续调度轮询或回写状态。
 */
export function startRuntimeUpgradePolling({
  intervalMs,
  request,
  onStatus,
  onError
}: StartRuntimeUpgradePollingParams) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeAbortCtrl: AbortController | undefined;

  const scheduleNext = () => {
    timer = setTimeout(() => {
      timer = undefined;
      const abortCtrl = new AbortController();
      activeAbortCtrl = abortCtrl;

      void (async () => {
        try {
          const status = await request(abortCtrl);
          if (stopped || abortCtrl.signal.aborted) return;

          await onStatus(status);
          if (stopped || abortCtrl.signal.aborted) return;

          if (status.status === 'upgrading') {
            scheduleNext();
          }
        } catch (error) {
          if (!stopped && !abortCtrl.signal.aborted) {
            onError(error);
          }
        } finally {
          activeAbortCtrl = undefined;
        }
      })();
    }, intervalMs);
  };

  scheduleNext();

  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    activeAbortCtrl?.abort();
  };
}
