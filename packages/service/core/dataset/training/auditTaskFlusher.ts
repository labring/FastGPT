import { refreshTrainingAuditTask } from './audit';

const TRAINING_AUDIT_REFRESH_INTERVAL_MS = 5 * 1000;

/**
 * 为训练队列维护待刷新的审计任务集合。
 *
 * 任务完成后不再逐条扫描 Mongo，而是由短周期 flush 和队列退出时的最终 flush 共同收口；
 * 同一轮内重复领取的 chunk 只保留一个 taskId，且 flush 期间新增的 taskId 会留给下一轮处理。
 */
export const createTrainingAuditTaskFlusher = (
  refresh: (auditTaskId: string) => Promise<void> = refreshTrainingAuditTask
) => {
  const pendingTaskIds = new Set<string>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let flushing: Promise<void> | undefined;

  const flush = async () => {
    if (flushing) return flushing;

    const taskIds = Array.from(pendingTaskIds);
    taskIds.forEach((taskId) => pendingTaskIds.delete(taskId));
    if (taskIds.length === 0) return;

    const currentFlush = Promise.allSettled(taskIds.map((taskId) => refresh(taskId))).then(
      () => undefined
    );
    flushing = currentFlush;
    try {
      await currentFlush;
    } finally {
      if (flushing === currentFlush) flushing = undefined;
    }
  };

  return {
    add: (auditTaskId?: string) => {
      if (!auditTaskId) return;
      pendingTaskIds.add(auditTaskId);
      timer ??= setInterval(() => {
        void flush();
      }, TRAINING_AUDIT_REFRESH_INTERVAL_MS);
    },
    stop: async () => {
      if (timer) clearInterval(timer);
      timer = undefined;

      // 先等待可能正在执行的周期 flush，再补一次，覆盖 flush 期间新加入的 taskId。
      await flush();
      await flush();
    }
  };
};
