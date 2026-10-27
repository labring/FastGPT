type DurationLogger = {
  debug: (message: string, properties?: Record<string, unknown>) => void;
  warn: (message: string, properties?: Record<string, unknown>) => void;
};

export type DurationLogOptions<T> = {
  logger: DurationLogger;
  /** 稳定、可检索的消息，同一模块的阶段差异通过 properties.stage 区分 */
  message: string;
  /** 调用前就已知的字段，例如 stage、teamId、来源列表 */
  properties?: Record<string, unknown>;
  /** 调用完成后补充的字段，例如结果数量；不要把完整结果本身写进日志 */
  summary?: (result: T) => Record<string, unknown>;
};

/**
 * 慢阶段阈值。超过该耗时的阶段用 warn 输出，默认配置下会同时进入 console 与 OTEL，
 * 便于线上直接按 durationMs 检索慢请求；正常耗时只留 debug，避免列表类接口刷日志。
 */
const SLOW_DURATION_MS = 1000;

const logDuration = ({
  logger,
  message,
  fields
}: {
  logger: DurationLogger;
  message: string;
  fields: Record<string, unknown> & { durationMs: number };
}) => {
  if (fields.durationMs >= SLOW_DURATION_MS) {
    logger.warn(message, fields);
    return;
  }

  logger.debug(message, fields);
};

/**
 * 测量同步的合并、权限解析和过滤等处理，沿用异步阶段的等级、摘要与失败标记。
 * 保持同步返回和原始异常，不引入 await，避免把微任务排队时间计入处理耗时。
 */
export const withSyncDurationLog = <T>(
  { logger, message, properties, summary }: DurationLogOptions<T>,
  run: () => T
): T => {
  const startedAt = Date.now();

  try {
    const result = run();

    logDuration({
      logger,
      message,
      fields: {
        ...properties,
        ...summary?.(result),
        durationMs: Date.now() - startedAt
      }
    });

    return result;
  } catch (error) {
    logDuration({
      logger,
      message,
      fields: {
        ...properties,
        durationMs: Date.now() - startedAt,
        failed: true
      }
    });

    throw error;
  }
};

/**
 * 测量一次异步调用（通常是下游请求或数据库查询）的耗时并输出结构化日志。
 *
 * 用途：定位接口慢在哪个阶段。外层 HTTP 中间件已经记录整个请求耗时，这里只补齐
 * 逐个阶段的耗时和规模，便于区分「插件服务慢」「数据库慢」「鉴权慢」。
 * 失败分支同样记录耗时：下游超时表现为慢请求加报错，丢掉耗时会漏掉关键线索。
 */
export const withDurationLog = async <T>(
  { logger, message, properties, summary }: DurationLogOptions<T>,
  run: () => Promise<T>
): Promise<T> => {
  const startedAt = Date.now();

  try {
    const result = await run();

    logDuration({
      logger,
      message,
      fields: {
        ...properties,
        ...summary?.(result),
        durationMs: Date.now() - startedAt
      }
    });

    return result;
  } catch (error) {
    logDuration({
      logger,
      message,
      fields: {
        ...properties,
        durationMs: Date.now() - startedAt,
        failed: true
      }
    });

    throw error;
  }
};
