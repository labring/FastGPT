/** 执行请求参数 */
export interface ExecuteOptions {
  code: string;
  variables: Record<string, any>;
  limits?: {
    timeoutMs?: number;
    memoryMB?: number;
    diskMB?: number;
  };
}

/** 执行结果 */
export interface ExecuteResult {
  success: boolean;
  data?: {
    codeReturn: any;
    log: string;
  };
  message?: string;
}

/** Runner 配置 */
export interface RunnerConfig {
  defaultTimeoutMs: number;
  defaultMemoryMB: number;
  defaultDiskMB: number;
}

/** 进程池配置 */
export interface PoolConfig {
  poolSize: number;
  maxIdleMs: number;
  maxRecycle: number;
}

/** 池化进程的抽象 */
export interface PooledProcess {
  proc: import('child_process').ChildProcess;
  useCount: number;
  lastUsed: number;
  isAlive(): boolean;
  kill(): void;
}
