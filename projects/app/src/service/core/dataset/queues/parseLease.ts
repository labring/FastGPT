export const PARSE_QUEUE_LEASE_TIMEOUT_MINUTES = 10;
export const PARSE_QUEUE_LEASE_HEARTBEAT_INTERVAL_MS = 60 * 1000;

export type ParseTaskLeaseFilter<TTaskId = unknown> = {
  _id: TTaskId;
  lockTime: Date;
};

type CreateParseTaskLeaseParams<TTaskId> = {
  taskId: TTaskId;
  lockTime: Date;
  updateLock: (filter: ParseTaskLeaseFilter<TTaskId>, nextLockTime: Date) => Promise<boolean>;
  intervalMs?: number;
  onLost?: () => void;
  onError?: (error: unknown) => void;
};

export type ParseTaskLease = {
  getFilter: () => ParseTaskLeaseFilter;
  isLost: () => boolean;
  heartbeat: () => Promise<void>;
  start: () => void;
  stop: () => Promise<void>;
};

/**
 * 创建基于 lockTime 的乐观 lease。
 *
 * heartbeat 只在当前 lockTime 仍匹配时续租；匹配失败代表任务已经被其他 worker
 * 领取，后续写操作继续使用最后一个 lease 条件，从而不会覆盖新 worker 的状态。
 */
export const createParseTaskLease = <TTaskId>({
  taskId,
  lockTime,
  updateLock,
  intervalMs = PARSE_QUEUE_LEASE_HEARTBEAT_INTERVAL_MS,
  onLost,
  onError
}: CreateParseTaskLeaseParams<TTaskId>): ParseTaskLease => {
  let expectedLockTime = lockTime;
  let timer: ReturnType<typeof setInterval> | undefined;
  let pendingHeartbeat: Promise<void> | undefined;
  let stopped = false;
  let lost = false;

  const handleLost = () => {
    lost = true;
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    try {
      onLost?.();
    } catch {
      // lease 状态已经丢失，通知日志失败不应影响 heartbeat 的收尾。
    }
  };

  const heartbeat = async () => {
    if (stopped || lost) return;

    const nextLockTime = new Date();
    try {
      const renewed = await updateLock(
        {
          _id: taskId,
          lockTime: expectedLockTime
        },
        nextLockTime
      );

      if (!renewed) {
        handleLost();
        return;
      }

      expectedLockTime = nextLockTime;
    } catch (error) {
      try {
        onError?.(error);
      } catch {
        // heartbeat 错误只影响本轮续租，不能留下未处理 rejection。
      }
    }
  };

  const start = () => {
    if (stopped || lost || timer) return;

    timer = setInterval(() => {
      if (pendingHeartbeat) return;

      const currentHeartbeat = heartbeat();
      pendingHeartbeat = currentHeartbeat;
      const clearPendingHeartbeat = () => {
        if (pendingHeartbeat === currentHeartbeat) {
          pendingHeartbeat = undefined;
        }
      };
      void currentHeartbeat.then(clearPendingHeartbeat, clearPendingHeartbeat);
    }, intervalMs);
  };

  const stop = async () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    await pendingHeartbeat;
  };

  return {
    getFilter: () => ({
      _id: taskId,
      lockTime: expectedLockTime
    }),
    isLost: () => lost,
    heartbeat,
    start,
    stop
  };
};
