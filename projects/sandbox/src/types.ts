/** 执行请求参数 */
export interface ExecuteOptions {
  code: string;
  variables: Record<string, any>;
  limits?: {
    timeoutMs?: number;
    memoryMB?: number;
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
  maxTimeoutMs: number;
  defaultMemoryMB: number;
}
