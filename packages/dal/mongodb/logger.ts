export type DalLogger = {
  warn: (message: string, data?: Record<string, unknown>) => void;
};

let injectedLogger: DalLogger | undefined;

/**
 * 注入 DAL 慢查询日志器。service 侧 composition root 启动时把业务 logger 注入进来，
 * 避免 DAL 包反向依赖 service 的日志实现；未注入时退回 console。
 */
export const setDalLogger = (logger?: DalLogger) => {
  injectedLogger = logger;
};

export const getDalLogger = (): DalLogger =>
  injectedLogger ?? {
    warn: (message, data) => console.warn(message, data ?? {})
  };
