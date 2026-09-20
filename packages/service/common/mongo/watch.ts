import { getLogger, LogCategories } from '../logger';

/** 驱动 ChangeStream 的最小接口：只依赖本文件使用的事件订阅与关闭能力，便于测试替身。 */
export type ChangeStreamLike = {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  close: () => unknown;
};

/** 所有 change 事件都带 operationType；`invalidate` 表示流已失效，必须重建。 */
export type ChangeStreamEvent = {
  operationType?: string;
};

export type ResilientChangeStreamOptions<Change extends ChangeStreamEvent> = {
  /** 日志标识，用于区分同一进程内的多条 watch。 */
  name: string;
  /** 打开一条新的 change stream。重连会反复调用，每次都必须返回全新的游标。 */
  createStream: () => ChangeStreamLike;
  /** 处理变更事件；抛错或 reject 只记录日志，不影响流存活。 */
  onChange: (change: Change) => unknown;
  /**
   * 重连成功后的补偿回调，用于补上断线期间丢失的事件。
   * 只在重连时触发，首次建流不触发（启动阶段由初始化流程负责）。
   */
  onResume?: () => unknown;
  /** 首次重连延迟，默认 1000ms。 */
  initialRetryDelayMs?: number;
  /** 重连延迟上限，默认 30000ms。 */
  maxRetryDelayMs?: number;
};

export type ResilientChangeStream = {
  /** 停止重连并关闭底层流；重复调用安全。 */
  close: () => Promise<void>;
};

/**
 * 给 change stream 补上终止事件处理与自动重连。
 *
 * 驱动只在可恢复错误（网络抖动、主节点切换等）时自动 resume；非可恢复错误
 * （`MongoClientClosedError`、`ChangeStreamHistoryLost` 等）和集合 drop 触发的 `invalidate`
 * 都会结束流，且结束后不会自愈。只写 `stream.on('change', ...)` 时，前者因无人监听 `error`
 * 变成未捕获异常，后者完全静默 —— 两种情况下 watch 都永久失效，只能靠重启进程恢复。
 *
 * 这里把 `error`、`close`、`invalidate` 收敛到一个幂等的重启调度上：一次断开只重连一次，
 * 延迟指数退避（收到事件后重置），避免 Mongo 抖动时形成重连风暴。
 */
export const createResilientChangeStream = <Change extends ChangeStreamEvent>({
  name,
  createStream,
  onChange,
  onResume,
  initialRetryDelayMs = 1000,
  maxRetryDelayMs = 30_000
}: ResilientChangeStreamOptions<Change>): ResilientChangeStream => {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  let current: ChangeStreamLike | undefined;
  let stopped = false;
  let openedOnce = false;
  let retryDelayMs = initialRetryDelayMs;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  /** 终止事件可能连续到达（error 紧接着 close），用一个待执行的定时器保证只重连一次。 */
  const scheduleRestart = (reason: string, error?: unknown) => {
    if (stopped || retryTimer) return;

    const delay = retryDelayMs;
    retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
    logger.warn('Mongo change stream ended, reconnecting', { name, reason, delay, error });
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      open();
    }, delay);
  };

  const handleChange = (change: Change) => {
    // 能收到事件说明流是健康的，退避重置，避免长期停在高延迟。
    retryDelayMs = initialRetryDelayMs;
    if (change.operationType === 'invalidate') {
      scheduleRestart('invalidate');
      return;
    }

    try {
      void Promise.resolve(onChange(change)).catch((error) =>
        logger.error('Mongo change stream handler failed', { name, error })
      );
    } catch (error) {
      logger.error('Mongo change stream handler failed', { name, error });
    }
  };

  function open() {
    if (stopped) return;

    let stream: ChangeStreamLike;
    try {
      stream = createStream();
    } catch (error) {
      // 建流失败（连接不可用、集合暂不存在等）同样按退避重试，不能让异常逃逸。
      scheduleRestart('create-failed', error);
      return;
    }

    current = stream;
    // 驱动拥有事件结构，调用方各自声明 Change 并负责字段收窄。
    stream.on('change', (change) => handleChange(change as Change));
    stream.on('error', (error) => scheduleRestart('error', error));
    stream.on('close', () => scheduleRestart('closed'));

    if (openedOnce && !stopped) {
      try {
        void Promise.resolve(onResume?.()).catch((error) =>
          logger.error('Mongo change stream resume handler failed', { name, error })
        );
      } catch (error) {
        logger.error('Mongo change stream resume handler failed', { name, error });
      }
    }
    openedOnce = true;
  }

  open();

  return {
    close: async () => {
      stopped = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      const stream = current;
      current = undefined;
      try {
        await stream?.close();
      } catch {
        // 关闭失败无需处理：已标记停止，不会再有重连。
      }
    }
  };
};
