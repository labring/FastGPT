/**
 * E2B 适配器配置
 */
export interface E2BConfig {
  /** E2B API Key */
  apiKey: string;
  /** 的沙盒 ID，用于连接到已存在的沙盒 */
  sandboxId: string;
  /** 可选的模板 ID，用于创建新沙盒 */
  template?: string;
  /** 可选的超时时间（秒） */
  timeout?: number;
  /** 可选的环境变量 */
  envs?: Record<string, string>;
  /** 可选的元数据 */
  metadata?: Record<string, string>;
}
