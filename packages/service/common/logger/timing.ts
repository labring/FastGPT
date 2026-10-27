type DurationLogger = {
  debug: (message: string, properties?: Record<string, unknown>) => void;
  warn: (message: string, properties?: Record<string, unknown>) => void;
};

type TimingResult<T> = T extends PromiseLike<unknown> ? Promise<Awaited<T>> : T;

export type TimingOptions<Args extends unknown[], Result> = {
  logger: DurationLogger;
  /** 稳定的事件标识，同时用于日志正文和结构化检索。 */
  event: string;
  /** 被计时的处理阶段，与 event 一起标识一次阶段日志。 */
  stage: string;
  /** 固定字段或按本次调用入参生成的摘要；不要记录完整业务参数。 */
  properties?: Record<string, unknown> | ((...args: Args) => Record<string, unknown>);
  /** 成功后补充数量等摘要，异步函数传入的是兑现后的结果。 */
  summary?: (result: Awaited<Result>) => Record<string, unknown>;
};

/**
 * 在函数装配时注入计时，返回可以正常传参调用的函数；每次调用独立计时并沿用日志上下文。
 * 同步结果仍同步返回，Promise/thenable 等到完成后记录耗时；保留 this 和原始业务异常。
 * 阶段达到 1000ms 使用 warn，其余使用 debug，成功只记录摘要，失败补充 failed 标记。
 */
export const withTiming = <Args extends unknown[], Result, This>(
  { logger, event, stage, properties, summary }: TimingOptions<NoInfer<Args>, NoInfer<Result>>,
  run: (this: This, ...args: Args) => Result
) => {
  return function (this: This, ...args: Args): TimingResult<Result> {
    const startedAt = Date.now();
    const callProperties = typeof properties === 'function' ? properties(...args) : properties;

    /** 每次调用独立持有开始时间和字段，避免并发调用相互覆盖。 */
    const logDuration = (fields: Record<string, unknown>) => {
      const durationMs = Date.now() - startedAt;
      const log = durationMs >= 1000 ? logger.warn : logger.debug;
      // 固定标识由计时器持有，业务字段和结果摘要不能覆盖 event、stage 或实际耗时。
      log.call(logger, event, { ...callProperties, ...fields, event, stage, durationMs });
    };
    const onSuccess = (result: Awaited<Result>) => {
      logDuration(summary?.(result) ?? {});
      return result;
    };
    const onFailure = (error: unknown): never => {
      logDuration({ failed: true });
      throw error;
    };

    try {
      const result = run.apply(this, args);
      // Mongo Query 等 thenable 也属于异步调用，不能在拿到对象时就结束计时。
      const isPromiseLike =
        result !== null &&
        (typeof result === 'object' || typeof result === 'function') &&
        'then' in result &&
        typeof result.then === 'function';
      if (isPromiseLike) {
        return Promise.resolve<Result>(result)
          .then(onSuccess)
          .catch(onFailure) as TimingResult<Result>;
      }

      // 运行时分支已经区分同步和异步；条件返回类型在泛型实现内部需要显式收窄。
      return onSuccess(result as Awaited<Result>) as TimingResult<Result>;
    } catch (error) {
      return onFailure(error);
    }
  };
};
